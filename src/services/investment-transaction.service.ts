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

interface CreateInvestmentTransactionData {
  accountId: string;
  assetSymbol: string;
  assetName: string;
  assetType: InvestmentAssetType;
  type: 'BUY' | 'SELL';
  quantity: number;
  pricePerUnit: number;
  fees?: number;
  currency?: string;
  transactionDate?: Date;
  notes?: string;
  exchangeRate?: number;
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
   * Crear una nueva transacción (BUY o SELL)
   */
  async createTransaction(
    userId: string,
    data: CreateInvestmentTransactionData
  ): Promise<InvestmentTransaction> {
    // Verificar que la cuenta existe, pertenece al usuario y es tipo INVESTMENT
    const account = await prisma.account.findFirst({
      where: {
        id: data.accountId,
        userId,
        type: 'INVESTMENT',
      },
    });

    if (!account) {
      throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
    }

    const fees = data.fees || 0;
    const currency = data.currency || 'USD';
    const totalAmount = data.pricePerUnit * data.quantity;
    const isBuy = data.type === 'BUY';

    // Validar balance si es una compra
    if (isBuy) {
      const totalCost = totalAmount + fees;
      if (Number(account.balance) < totalCost) {
        throw new AppError(ErrorCodes.INSUFFICIENT_BALANCE, 400);
      }
    }

    // Usar transacción de Prisma para asegurar atomicidad
    const result = await prisma.$transaction(async (tx) => {
      // Buscar o crear el holding
      let holding = await tx.investmentHolding.findUnique({
        where: {
          accountId_assetSymbol: {
            accountId: data.accountId,
            assetSymbol: data.assetSymbol.toUpperCase(),
          },
        },
      });

      // Si es SELL, validar que existe y tiene suficiente cantidad
      if (!isBuy) {
        if (!holding) {
          throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
        }
        if (Number(holding.totalQuantity) < data.quantity) {
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
      }

      if (!holding) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      // Crear la transacción
      const transaction = await tx.investmentTransaction.create({
        data: {
          userId,
          accountId: data.accountId,
          holdingId: holding.id,
          assetSymbol: data.assetSymbol.toUpperCase(),
          assetType: data.assetType,
          type: data.type,
          quantity: data.quantity,
          pricePerUnit: data.pricePerUnit,
          totalAmount,
          fees,
          currency,
          exchangeRate: data.exchangeRate || null,
          transactionDate: data.transactionDate || new Date(),
          notes: data.notes || null,
        },
      });

      // Actualizar balance de la cuenta
      const balanceChange = isBuy ? -(totalAmount + fees) : totalAmount - fees;

      await tx.account.update({
        where: { id: data.accountId },
        data: {
          balance: {
            increment: balanceChange,
          },
        },
      });

      // Actualizar holding (fuera de la transacción de Prisma para usar el servicio)
      // Lo hacemos después de la transacción

      return transaction;
    });

    // Actualizar holding usando el servicio
    await investmentHoldingService.updateHoldingAfterTransaction(
      userId,
      data.accountId,
      data.assetSymbol,
      data.assetName,
      data.assetType,
      data.quantity,
      data.pricePerUnit,
      fees,
      currency,
      isBuy
    );

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

    const isBuy = transaction.type === 'BUY';
    const totalAmount = Number(transaction.totalAmount);
    const fees = Number(transaction.fees);

    // Usar transacción de Prisma para asegurar atomicidad
    await prisma.$transaction(async (tx) => {
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
}

export const investmentTransactionService = new InvestmentTransactionService();
