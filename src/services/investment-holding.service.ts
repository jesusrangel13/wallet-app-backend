import { PrismaClient, InvestmentHolding, InvestmentAssetType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { priceProviderService } from './price-provider.service';

const prisma = new PrismaClient();

interface HoldingWithMetrics extends InvestmentHolding {
  currentPrice?: number;
  currentValue?: number;
  unrealizedGainLoss?: number;
  roi?: number;
  change24h?: number;
  allocation?: number;
}

interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedGainLoss: number;
  totalRealizedGainLoss: number;
  overallROI: number;
  holdingsCount: number;
  currency: string;
  holdings: HoldingWithMetrics[];
}

class InvestmentHoldingService {
  /**
   * Obtener holdings de una cuenta con precios actuales y métricas
   */
  async getHoldingsByAccount(
    userId: string,
    accountId: string
  ): Promise<HoldingWithMetrics[]> {
    // Verificar que la cuenta pertenece al usuario y es tipo INVESTMENT
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
        type: 'INVESTMENT',
      },
    });

    if (!account) {
      throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
    }

    // Obtener holdings
    const holdings = await prisma.investmentHolding.findMany({
      where: {
        accountId,
        userId,
      },
      orderBy: {
        totalCostBasis: 'desc', // Ordenar por valor invertido
      },
    });

    if (holdings.length === 0) {
      return [];
    }

    // Obtener precios actuales en batch
    const symbols = holdings.map((h) => ({
      symbol: h.assetSymbol,
      assetType: h.assetType,
    }));

    const prices = await priceProviderService.getBatchPrices(symbols);

    // Calcular métricas para cada holding
    const holdingsWithMetrics: HoldingWithMetrics[] = holdings.map((holding) => {
      const priceData = prices.get(holding.assetSymbol);
      const currentPrice = priceData?.price || 0;
      const currentValue = currentPrice * Number(holding.totalQuantity);
      const unrealizedGainLoss = currentValue - Number(holding.totalCostBasis);
      const roi =
        Number(holding.totalCostBasis) > 0
          ? (unrealizedGainLoss / Number(holding.totalCostBasis)) * 100
          : 0;

      return {
        ...holding,
        currentPrice,
        currentValue,
        unrealizedGainLoss,
        roi,
        change24h: priceData?.change24h,
      };
    });

    // Calcular allocation (porcentaje del portafolio)
    const totalPortfolioValue = holdingsWithMetrics.reduce(
      (sum, h) => sum + (h.currentValue || 0),
      0
    );

    if (totalPortfolioValue > 0) {
      holdingsWithMetrics.forEach((h) => {
        h.allocation = ((h.currentValue || 0) / totalPortfolioValue) * 100;
      });
    }

    return holdingsWithMetrics;
  }

  /**
   * Obtener un holding específico por símbolo
   */
  async getHoldingBySymbol(
    userId: string,
    accountId: string,
    assetSymbol: string
  ): Promise<HoldingWithMetrics | null> {
    const holding = await prisma.investmentHolding.findFirst({
      where: {
        accountId,
        userId,
        assetSymbol: assetSymbol.toUpperCase(),
      },
    });

    if (!holding) {
      return null;
    }

    // Obtener precio actual
    const priceData = await priceProviderService.getCurrentPrice(
      holding.assetSymbol,
      holding.assetType
    );

    const currentPrice = priceData.price;
    const currentValue = currentPrice * Number(holding.totalQuantity);
    const unrealizedGainLoss = currentValue - Number(holding.totalCostBasis);
    const roi =
      Number(holding.totalCostBasis) > 0
        ? (unrealizedGainLoss / Number(holding.totalCostBasis)) * 100
        : 0;

    return {
      ...holding,
      currentPrice,
      currentValue,
      unrealizedGainLoss,
      roi,
      change24h: priceData.change24h,
      allocation: 100, // 100% si es el único holding
    };
  }

  /**
   * Calcular resumen completo del portafolio
   */
  async calculatePortfolioSummary(
    userId: string,
    accountId: string
  ): Promise<PortfolioSummary> {
    const holdings = await this.getHoldingsByAccount(userId, accountId);

    if (holdings.length === 0) {
      return {
        totalValue: 0,
        totalCostBasis: 0,
        totalUnrealizedGainLoss: 0,
        totalRealizedGainLoss: 0,
        overallROI: 0,
        holdingsCount: 0,
        currency: 'USD',
        holdings: [],
      };
    }

    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const totalCostBasis = holdings.reduce(
      (sum, h) => sum + Number(h.totalCostBasis),
      0
    );
    const totalUnrealizedGainLoss = holdings.reduce(
      (sum, h) => sum + (h.unrealizedGainLoss || 0),
      0
    );
    const totalRealizedGainLoss = holdings.reduce(
      (sum, h) => sum + Number(h.realizedGainLoss),
      0
    );
    const overallROI = totalCostBasis > 0 ? (totalUnrealizedGainLoss / totalCostBasis) * 100 : 0;

    return {
      totalValue,
      totalCostBasis,
      totalUnrealizedGainLoss,
      totalRealizedGainLoss,
      overallROI,
      holdingsCount: holdings.length,
      currency: holdings[0]?.currency || 'USD',
      holdings,
    };
  }

  /**
   * Actualizar holding después de una transacción
   * Esta función es llamada internamente por el transaction service
   */
  async updateHoldingAfterTransaction(
    userId: string,
    accountId: string,
    assetSymbol: string,
    assetName: string,
    assetType: InvestmentAssetType,
    quantity: number,
    pricePerUnit: number,
    fees: number,
    currency: string,
    isBuy: boolean
  ): Promise<InvestmentHolding> {
    // Buscar holding existente
    const existingHolding = await prisma.investmentHolding.findUnique({
      where: {
        accountId_assetSymbol: {
          accountId,
          assetSymbol: assetSymbol.toUpperCase(),
        },
      },
    });

    if (isBuy) {
      // COMPRA: Crear o actualizar holding
      if (existingHolding) {
        // Calcular nuevo promedio ponderado
        const currentTotalValue =
          Number(existingHolding.averageCostPerUnit) *
          Number(existingHolding.totalQuantity);
        const newPurchaseValue = pricePerUnit * quantity + fees;
        const newTotalQuantity = Number(existingHolding.totalQuantity) + quantity;
        const newAverageCost = (currentTotalValue + newPurchaseValue) / newTotalQuantity;
        const newTotalCostBasis = Number(existingHolding.totalCostBasis) + newPurchaseValue;

        return await prisma.investmentHolding.update({
          where: { id: existingHolding.id },
          data: {
            totalQuantity: newTotalQuantity,
            averageCostPerUnit: newAverageCost,
            totalCostBasis: newTotalCostBasis,
          },
        });
      } else {
        // Crear nuevo holding
        const totalCost = pricePerUnit * quantity + fees;
        return await prisma.investmentHolding.create({
          data: {
            userId,
            accountId,
            assetSymbol: assetSymbol.toUpperCase(),
            assetName,
            assetType,
            totalQuantity: quantity,
            averageCostPerUnit: totalCost / quantity,
            totalCostBasis: totalCost,
            currency,
          },
        });
      }
    } else {
      // VENTA: Reducir holding
      if (!existingHolding) {
        throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
      }

      if (Number(existingHolding.totalQuantity) < quantity) {
        throw new AppError(ErrorCodes.INSUFFICIENT_BALANCE, 400);
      }

      const newTotalQuantity = Number(existingHolding.totalQuantity) - quantity;

      // Calcular ganancia/pérdida realizada
      const costBasisSold = Number(existingHolding.averageCostPerUnit) * quantity;
      const proceedsFromSale = pricePerUnit * quantity - fees;
      const realizedGainLoss = proceedsFromSale - costBasisSold;

      if (newTotalQuantity === 0) {
        // Mantener el holding pero con cantidad 0
        return await prisma.investmentHolding.update({
          where: { id: existingHolding.id },
          data: {
            totalQuantity: 0,
            totalCostBasis: 0,
            realizedGainLoss: {
              increment: realizedGainLoss,
            },
          },
        });
      } else {
        // Reducir cantidad y cost basis proporcionalmente
        const newTotalCostBasis =
          Number(existingHolding.totalCostBasis) - costBasisSold;

        return await prisma.investmentHolding.update({
          where: { id: existingHolding.id },
          data: {
            totalQuantity: newTotalQuantity,
            totalCostBasis: newTotalCostBasis,
            realizedGainLoss: {
              increment: realizedGainLoss,
            },
          },
        });
      }
    }
  }

  /**
   * Obtener valor total de holdings de un usuario (para cálculo de patrimonio neto)
   */
  async getTotalHoldingsValue(userId: string): Promise<{ [currency: string]: number }> {
    // Obtener todas las cuentas de inversión del usuario
    const investmentAccounts = await prisma.account.findMany({
      where: {
        userId,
        type: 'INVESTMENT',
        isArchived: false,
        includeInTotalBalance: true,
      },
    });

    if (investmentAccounts.length === 0) {
      return {};
    }

    // Obtener todos los holdings de estas cuentas
    const allHoldings = await prisma.investmentHolding.findMany({
      where: {
        userId,
        accountId: {
          in: investmentAccounts.map((acc) => acc.id),
        },
        totalQuantity: {
          gt: 0, // Solo holdings con cantidad > 0
        },
      },
    });

    if (allHoldings.length === 0) {
      return {};
    }

    // Obtener precios actuales
    const symbols = allHoldings.map((h) => ({
      symbol: h.assetSymbol,
      assetType: h.assetType,
    }));

    const prices = await priceProviderService.getBatchPrices(symbols);

    // Calcular valor por moneda
    const valueByC urrency: { [currency: string]: number } = {};

    allHoldings.forEach((holding) => {
      const priceData = prices.get(holding.assetSymbol);
      if (priceData) {
        const currentValue = priceData.price * Number(holding.totalQuantity);
        const currency = holding.currency;

        if (!valueByC currency[currency]) {
          valueByC currency[currency] = 0;
        }
        valueByC currency[currency] += currentValue;
      }
    });

    return valueByC currency;
  }
}

export const investmentHoldingService = new InvestmentHoldingService();
