import {
  PrismaClient,
  InvestmentTransaction,
  InvestmentAssetType,
  InvestmentTransactionType,
} from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { investmentHoldingService } from './investment-holding.service';

const prisma = new PrismaClient();

// Campos comunes a todos los tipos de transacciones
interface BaseTransactionData {
  accountId: string;
  assetSymbol: string;
  assetName: string;
  assetType: InvestmentAssetType;
  fees?: number;
  currency?: string;
  transactionDate?: Date;
  notes?: string;
  exchangeRate?: number;
}

// Tipo para transacciones BUY/SELL
interface CreateBuyOrSellData extends BaseTransactionData {
  type: 'BUY' | 'SELL';
  quantity: number;
  pricePerUnit: number;
}

// Tipo para transacciones DIVIDEND/INTEREST
interface CreateDividendOrInterestData extends BaseTransactionData {
  type: 'DIVIDEND' | 'INTEREST';
  amount: number;
}

// Union type que puede ser cualquiera de los dos
type CreateInvestmentTransactionData =
  | CreateBuyOrSellData
  | CreateDividendOrInterestData;

// Opciones para optimizar el procesamiento durante imports masivos
export interface CreateTransactionOptions {
  skipAccountValidation?: boolean; // Skip account existence validation (already validated)
  skipBalanceValidation?: boolean; // Skip balance sufficiency validation (validated at end)
  holdingsCache?: Map<string, any>; // Cache of holdings to avoid repeated queries
  accumulateBalanceOnly?: boolean; // Don't update balance in DB, only return change
}

interface TransactionFilters {
  accountId?: string;
  assetSymbol?: string;
  type?: InvestmentTransactionType;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

class InvestmentTransactionService {
  /**
   * Crear una nueva transacción (BUY, SELL, DIVIDEND o INTEREST)
   * @param options - Opciones adicionales para la creación de la transacción (para optimización de imports)
   * @returns Transaction creada y el cambio de balance calculado
   */
  async createTransaction(
    userId: string,
    data: CreateInvestmentTransactionData,
    options?: CreateTransactionOptions
  ): Promise<{ transaction: InvestmentTransaction; balanceChange: number }> {
    // Verificar que la cuenta existe solo si no se omite la validación
    let account: any = null;
    if (!options?.skipAccountValidation) {
      account = await prisma.account.findFirst({
        where: {
          id: data.accountId,
          userId,
          type: 'INVESTMENT',
        },
      });

      if (!account) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }
    }

    const fees = data.fees || 0;
    const currency = data.currency || 'USD';

    // Detectar tipo de transacción
    const isDividendOrInterest = data.type === 'DIVIDEND' || data.type === 'INTEREST';
    const isBuy = data.type === 'BUY';

    // Calcular valores según tipo de transacción
    let totalAmount: number;
    let quantity: number;
    let pricePerUnit: number;

    if (isDividendOrInterest) {
      // Para dividendos/intereses: usar amount directamente
      totalAmount = (data as CreateDividendOrInterestData).amount;
      quantity = 0; // No afecta la cantidad del holding
      pricePerUnit = totalAmount; // Guardamos el monto aquí para registro
    } else {
      // Para BUY/SELL: calcular desde quantity * pricePerUnit
      const buyOrSellData = data as CreateBuyOrSellData;
      quantity = buyOrSellData.quantity;
      pricePerUnit = buyOrSellData.pricePerUnit;
      totalAmount = quantity * pricePerUnit;
    }

    // Validar balance si es una compra (solo si no se omite la validación)
    if (isBuy && !options?.skipBalanceValidation) {
      const totalCost = totalAmount + fees;
      if (Number(account.balance) < totalCost) {
        throw new AppError(
          ErrorCodes.INSUFFICIENT_BALANCE,
          400,
          `Insufficient funds. Account balance: ${account.balance} ${account.currency}, Required: ${totalCost.toFixed(2)} ${currency}`
        );
      }
    }

    // Usar transacción de Prisma para asegurar atomicidad
    const result = await prisma.$transaction(async (tx) => {
      // Buscar el holding - usar cache si está disponible
      let holding = options?.holdingsCache?.get(data.assetSymbol.toUpperCase());

      if (!holding) {
        holding = await tx.investmentHolding.findUnique({
          where: {
            accountId_assetSymbol: {
              accountId: data.accountId,
              assetSymbol: data.assetSymbol.toUpperCase(),
            },
          },
        });

        // Agregar al cache si está disponible
        if (holding && options?.holdingsCache) {
          options.holdingsCache.set(holding.assetSymbol, holding);
        }
      }

      // Para dividendos/intereses: DEBE existir el holding
      if (isDividendOrInterest) {
        if (!holding) {
          throw new AppError(
            ErrorCodes.ENTITY_NOT_FOUND,
            404,
            'Cannot record dividend/interest without an existing holding'
          );
        }
      }

      // Si es SELL, validar que existe y tiene suficiente cantidad
      if (!isBuy && !isDividendOrInterest) {
        if (!holding) {
          throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
        }
        if (Number(holding.totalQuantity) < quantity) {
          throw new AppError(ErrorCodes.INSUFFICIENT_BALANCE, 400);
        }
      }

      // Si es BUY y no existe holding, crear uno temporal
      if (isBuy && !holding) {
        holding = await tx.investmentHolding.create({
          data: {
            userId,
            accountId: data.accountId,
            assetSymbol: data.assetSymbol.toUpperCase(),
            assetName: data.assetName,
            assetType: data.assetType,
            totalQuantity: 0,
            averageCostPerUnit: 0,
            totalCostBasis: 0,
            currency,
          },
        });

        // Agregar el nuevo holding al cache si está disponible
        if (options?.holdingsCache) {
          options.holdingsCache.set(holding.assetSymbol, holding);
        }
      }

      if (!holding) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      // Crear la transacción (sin snapshot inicialmente)
      const transaction = await tx.investmentTransaction.create({
        data: {
          userId,
          accountId: data.accountId,
          holdingId: holding.id,
          assetSymbol: data.assetSymbol.toUpperCase(),
          assetType: data.assetType,
          type: data.type,
          quantity,
          pricePerUnit,
          totalAmount,
          fees,
          currency,
          exchangeRate: data.exchangeRate || null,
          transactionDate: data.transactionDate || new Date(),
          notes: data.notes || null,
          snapshotValue: null, // Will be calculated after transaction completes
        },
      });

      // Calcular cambio de balance
      let balanceChange: number;

      if (isDividendOrInterest) {
        // Dividendos/intereses son ingresos: incrementar balance
        balanceChange = totalAmount - fees;
      } else if (isBuy) {
        // Compras: decrementar balance
        balanceChange = -(totalAmount + fees);
      } else {
        // Ventas: incrementar balance
        balanceChange = totalAmount - fees;
      }

      // Actualizar balance solo si no se está acumulando para batch update
      if (!options?.accumulateBalanceOnly) {
        await tx.account.update({
          where: { id: data.accountId },
          data: {
            balance: {
              increment: balanceChange,
            },
          },
        });
      }

      return { transaction, balanceChange };
    });

    // Actualizar holding SOLO si es BUY o SELL (no para dividendos/intereses)
    if (!isDividendOrInterest) {
      await investmentHoldingService.updateHoldingAfterTransaction(
        userId,
        data.accountId,
        data.assetSymbol,
        data.assetName,
        data.assetType,
        quantity,
        pricePerUnit,
        fees,
        currency,
        isBuy
      );
    }

    // Calcular y guardar snapshot del portafolio DESPUÉS de la transacción
    // Solo si no se está haciendo un batch update (imports masivos)
    if (!options?.accumulateBalanceOnly) {
      try {
        const snapshot = await this.calculatePortfolioSnapshot(
          userId,
          data.accountId,
          data.transactionDate || new Date()
        );

        await prisma.investmentTransaction.update({
          where: { id: result.transaction.id },
          data: { snapshotValue: snapshot.totalValue },
        });
      } catch (error) {
        // Log error pero no fallar la transacción
        console.error('Error calculating portfolio snapshot:', error);
      }
    }

    return result;
  }

  /**
   * Obtener transacciones con filtros y paginación
   */
  async getTransactionsByAccount(
    userId: string,
    filters: TransactionFilters
  ): Promise<{
    transactions: InvestmentTransaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    // Construir where clause
    const where: any = {
      userId,
    };

    if (filters.accountId) {
      // Verificar que la cuenta pertenece al usuario
      const account = await prisma.account.findFirst({
        where: {
          id: filters.accountId,
          userId,
          type: 'INVESTMENT',
        },
      });

      if (!account) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      where.accountId = filters.accountId;
    }

    if (filters.assetSymbol) {
      where.assetSymbol = filters.assetSymbol.toUpperCase();
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.transactionDate = {};
      if (filters.dateFrom) {
        where.transactionDate.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        where.transactionDate.lte = filters.dateTo;
      }
    }

    // Obtener transacciones y total en paralelo
    const [transactions, total] = await Promise.all([
      prisma.investmentTransaction.findMany({
        where,
        orderBy: {
          transactionDate: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.investmentTransaction.count({ where }),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
    };
  }

  /**
   * Obtener una transacción específica
   */
  async getTransactionById(
    userId: string,
    transactionId: string
  ): Promise<InvestmentTransaction> {
    const transaction = await prisma.investmentTransaction.findFirst({
      where: {
        id: transactionId,
        userId,
      },
    });

    if (!transaction) {
      throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
    }

    return transaction;
  }

  /**
   * Eliminar una transacción (y revertir efectos)
   */
  async deleteTransaction(userId: string, transactionId: string): Promise<void> {
    // Obtener la transacción
    const transaction = await this.getTransactionById(userId, transactionId);

    const isDividendOrInterest = transaction.type === 'DIVIDEND' || transaction.type === 'INTEREST';
    const isBuy = transaction.type === 'BUY';
    const totalAmount = Number(transaction.totalAmount);
    const fees = Number(transaction.fees);

    // Usar transacción de Prisma para asegurar atomicidad
    await prisma.$transaction(async (tx) => {
      // Para dividendos/intereses: solo revertir el balance
      if (isDividendOrInterest) {
        // Revertir balance (decrementar lo que se había incrementado)
        await tx.account.update({
          where: { id: transaction.accountId },
          data: {
            balance: {
              decrement: totalAmount - fees,
            },
          },
        });

        // Eliminar la transacción
        await tx.investmentTransaction.delete({
          where: { id: transactionId },
        });

        return; // Salir temprano, no tocar holdings
      }

      // Para BUY/SELL: revertir efectos en holdings
      // Obtener el holding
      const holding = await tx.investmentHolding.findUnique({
        where: { id: transaction.holdingId },
      });

      if (!holding) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      // Revertir efectos en el holding
      if (isBuy) {
        // Si fue una compra, reducir cantidad y cost basis
        const costBasisOfTransaction =
          (Number(transaction.pricePerUnit) * Number(transaction.quantity) + fees) /
          Number(transaction.quantity);
        const quantityToRemove = Number(transaction.quantity);
        const newTotalQuantity = Number(holding.totalQuantity) - quantityToRemove;

        if (newTotalQuantity < 0) {
          throw new AppError(ErrorCodes.INVALID_INPUT, 400);
        }

        if (newTotalQuantity === 0) {
          // Si queda en 0, mantener el holding pero vacío
          await tx.investmentHolding.update({
            where: { id: holding.id },
            data: {
              totalQuantity: 0,
              totalCostBasis: 0,
              averageCostPerUnit: 0,
            },
          });
        } else {
          // Recalcular average cost sin esta transacción
          const currentTotalValue =
            Number(holding.averageCostPerUnit) * Number(holding.totalQuantity);
          const transactionValue = costBasisOfTransaction * quantityToRemove;
          const newTotalCostBasis = currentTotalValue - transactionValue;
          const newAverageCost = newTotalCostBasis / newTotalQuantity;

          await tx.investmentHolding.update({
            where: { id: holding.id },
            data: {
              totalQuantity: newTotalQuantity,
              totalCostBasis: newTotalCostBasis,
              averageCostPerUnit: newAverageCost,
            },
          });
        }

        // Revertir balance (devolver el dinero)
        await tx.account.update({
          where: { id: transaction.accountId },
          data: {
            balance: {
              increment: totalAmount + fees,
            },
          },
        });
      } else {
        // Si fue una venta, aumentar cantidad
        const quantityToAdd = Number(transaction.quantity);
        const costBasisToAdd =
          Number(holding.averageCostPerUnit) * quantityToAdd;
        const newTotalQuantity = Number(holding.totalQuantity) + quantityToAdd;
        const newTotalCostBasis = Number(holding.totalCostBasis) + costBasisToAdd;

        // Revertir realized gain/loss
        const proceedsFromSale = totalAmount - fees;
        const costBasis = Number(holding.averageCostPerUnit) * quantityToAdd;
        const realizedGainLoss = proceedsFromSale - costBasis;

        await tx.investmentHolding.update({
          where: { id: holding.id },
          data: {
            totalQuantity: newTotalQuantity,
            totalCostBasis: newTotalCostBasis,
            realizedGainLoss: {
              decrement: realizedGainLoss,
            },
          },
        });

        // Revertir balance (quitar el dinero recibido)
        await tx.account.update({
          where: { id: transaction.accountId },
          data: {
            balance: {
              decrement: totalAmount - fees,
            },
          },
        });
      }

      // Eliminar la transacción
      await tx.investmentTransaction.delete({
        where: { id: transactionId },
      });
    });
  }

  /**
   * Calcular ganancia/pérdida realizada de una venta
   */
  calculateRealizedGainLoss(
    sellPrice: number,
    sellQuantity: number,
    averageCostPerUnit: number,
    fees: number
  ): number {
    const proceeds = sellPrice * sellQuantity - fees;
    const costBasis = averageCostPerUnit * sellQuantity;
    return proceeds - costBasis;
  }

  /**
   * Calcular el valor total del portafolio en un momento específico
   * Usa precios de transacciones para estimar valor histórico
   */
  async calculatePortfolioSnapshot(
    userId: string,
    accountId: string,
    snapshotDate: Date
  ): Promise<{ totalValue: number; cashBalance: number }> {
    // 1. Obtener balance de cuenta actual
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return { totalValue: 0, cashBalance: 0 };
    }

    // 2. Obtener todas las transacciones hasta esta fecha
    const transactions = await prisma.investmentTransaction.findMany({
      where: {
        userId,
        accountId,
        transactionDate: { lte: snapshotDate },
      },
      orderBy: { transactionDate: 'asc' },
    });

    // 3. Simular estado de holdings en ese momento
    const holdings = new Map<string, {
      quantity: number;
      assetSymbol: string;
      assetType: string;
    }>();

    for (const tx of transactions) {
      const key = tx.assetSymbol;
      let holding = holdings.get(key);

      if (!holding) {
        holding = {
          quantity: 0,
          assetSymbol: tx.assetSymbol,
          assetType: tx.assetType,
        };
        holdings.set(key, holding);
      }

      switch (tx.type) {
        case 'BUY':
          holding.quantity += Number(tx.quantity);
          break;

        case 'SELL':
          holding.quantity -= Number(tx.quantity);
          break;

        // DIVIDEND e INTEREST no afectan cantidad
        case 'DIVIDEND':
        case 'INTEREST':
          break;
      }
    }

    // 4. Calcular valor de holdings usando precio de última transacción conocida
    let totalHoldingsValue = 0;

    for (const [symbol, holding] of holdings) {
      if (holding.quantity > 0) {
        // Buscar última transacción de este activo (BUY o SELL)
        const lastTx = transactions
          .filter(t =>
            t.assetSymbol === symbol &&
            (t.type === 'BUY' || t.type === 'SELL')
          )
          .pop();

        const estimatedPrice = lastTx ? Number(lastTx.pricePerUnit) : 0;
        totalHoldingsValue += holding.quantity * estimatedPrice;
      }
    }

    // 5. Cash balance actual de la cuenta
    const cashBalance = Number(account.balance);

    return {
      totalValue: cashBalance + totalHoldingsValue,
      cashBalance,
    };
  }
}

export const investmentTransactionService = new InvestmentTransactionService();
