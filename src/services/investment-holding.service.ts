import { PrismaClient, InvestmentHolding, InvestmentAssetType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { priceProviderService } from './price-provider.service';

const prisma = new PrismaClient();

interface HoldingWithMetrics extends InvestmentHolding {
  currentPrice?: number;
  currentValue?: number;
  unrealizedGainLoss?: number;
  unrealizedGainLossPercentage?: number;
  roi?: number;
  change24h?: number;
  allocation?: number;
  dateSold?: Date; // Solo presente en closed positions
  dividendsEarned?: number; // Total de dividendos ganados de este activo
}

interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalUnrealizedGainLoss: number;
  totalRealizedGainLoss: number;
  totalGainLoss: number;
  totalDividends: number; // Total de dividendos acumulados en el portafolio
  roi: number;
  currency: string;
  holdings: HoldingWithMetrics[];
  assetAllocation: {
    [key: string]: {
      value: number;
      percentage: number;
      count: number;
    };
  };
}

class InvestmentHoldingService {
  /**
   * Obtener holdings de una cuenta con precios actuales y métricas
   */
  async getHoldingsByAccount(
    userId: string,
    accountId: string,
    status?: 'active' | 'closed' | 'all'
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

    // Construir filtro de cantidad
    const quantityFilter =
      status === 'active'
        ? { gt: 0 }
        : status === 'closed'
        ? { equals: 0 }
        : undefined; // 'all' o sin especificar = todos

    // Obtener holdings
    const holdings = await prisma.investmentHolding.findMany({
      where: {
        accountId,
        userId,
        ...(quantityFilter && { totalQuantity: quantityFilter }),
      },
      orderBy: {
        totalCostBasis: 'desc', // Ordenar por valor invertido
      },
    });

    if (holdings.length === 0) {
      return [];
    }

    // Obtener dividendos para todos los holdings en batch
    const dividendsByAsset = new Map<string, number>();

    if (holdings.length > 0) {
      const symbols = holdings.map((h) => h.assetSymbol);

      const dividendAggregates = await prisma.investmentTransaction.groupBy({
        by: ['assetSymbol'],
        where: {
          accountId,
          assetSymbol: { in: symbols },
          type: { in: ['DIVIDEND', 'INTEREST'] },
        },
        _sum: {
          totalAmount: true,
        },
      });

      dividendAggregates.forEach((agg) => {
        dividendsByAsset.set(agg.assetSymbol, Number(agg._sum.totalAmount || 0));
      });
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
      const unrealizedGainLossPercentage =
        Number(holding.totalCostBasis) > 0
          ? (unrealizedGainLoss / Number(holding.totalCostBasis)) * 100
          : 0;
      // Para posiciones cerradas, calcular ROI basado en realizedGainLoss
      // Para posiciones activas, usar unrealizedGainLossPercentage
      const roi = Number(holding.totalQuantity) === 0
        ? Number(holding.totalCostBasis) > 0
          ? (Number(holding.realizedGainLoss) / Number(holding.totalCostBasis)) * 100
          : 0
        : unrealizedGainLossPercentage;

      return {
        ...holding,
        currentPrice,
        currentValue,
        unrealizedGainLoss,
        unrealizedGainLossPercentage,
        roi,
        change24h: priceData?.change24h,
        dividendsEarned: dividendsByAsset.get(holding.assetSymbol) || 0,
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

    // Si es closed positions, enriquecer con fecha de venta
    if (status === 'closed' && holdings.length > 0) {
      const closedSymbols = holdings.map((h) => h.assetSymbol);

      // Buscar la última transacción SELL para cada asset cerrado
      const lastSellDates = await prisma.investmentTransaction.groupBy({
        by: ['assetSymbol'],
        where: {
          accountId,
          assetSymbol: { in: closedSymbols },
          type: 'SELL',
        },
        _max: {
          transactionDate: true,
        },
      });

      // Mapear fechas a los holdings
      const dateSoldMap = new Map(
        lastSellDates.map((item) => [
          item.assetSymbol,
          item._max.transactionDate || null,
        ])
      );

      // Agregar dateSold a cada holding
      holdingsWithMetrics.forEach((holding) => {
        holding.dateSold = dateSoldMap.get(holding.assetSymbol) || holding.updatedAt;
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
    const unrealizedGainLossPercentage =
      Number(holding.totalCostBasis) > 0
        ? (unrealizedGainLoss / Number(holding.totalCostBasis)) * 100
        : 0;
    // Para posiciones cerradas, calcular ROI basado en realizedGainLoss
    // Para posiciones activas, usar unrealizedGainLossPercentage
    const roi = Number(holding.totalQuantity) === 0
      ? Number(holding.totalCostBasis) > 0
        ? (Number(holding.realizedGainLoss) / Number(holding.totalCostBasis)) * 100
        : 0
      : unrealizedGainLossPercentage;

    return {
      ...holding,
      currentPrice,
      currentValue,
      unrealizedGainLoss,
      unrealizedGainLossPercentage,
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
        totalGainLoss: 0,
        totalDividends: 0,
        roi: 0,
        currency: 'USD',
        holdings: [],
        assetAllocation: {},
      };
    }

    const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const totalCostBasis = holdings.reduce(
      (sum, h) => sum + Number(h.totalCostBasis),
      0
    );
    const totalUnrealizedGainLoss = holdings.reduce(
      (sum, h) => sum + (Number(h.totalQuantity) > 0 ? (h.unrealizedGainLoss || 0) : 0),
      0
    );
    const totalRealizedGainLoss = holdings.reduce(
      (sum, h) => sum + Number(h.realizedGainLoss),
      0
    );
    const totalGainLoss = totalUnrealizedGainLoss + totalRealizedGainLoss;
    const roi = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

    // Calcular dividendos totales
    const totalDividends = await this.aggregateDividends(accountId);

    // Calcular asset allocation por tipo
    const assetAllocation: {
      [key: string]: { value: number; percentage: number; count: number };
    } = {};

    holdings.forEach((h) => {
      const type = h.assetType;
      if (!assetAllocation[type]) {
        assetAllocation[type] = { value: 0, percentage: 0, count: 0 };
      }
      assetAllocation[type].value += h.currentValue || 0;
      assetAllocation[type].count += 1;
    });

    // Calcular porcentajes
    Object.values(assetAllocation).forEach((allocation) => {
      allocation.percentage = totalValue > 0 ? (allocation.value / totalValue) * 100 : 0;
    });

    return {
      totalValue,
      totalCostBasis,
      totalUnrealizedGainLoss,
      totalRealizedGainLoss,
      totalGainLoss,
      totalDividends,
      roi,
      currency: holdings[0]?.currency || 'USD',
      holdings,
      assetAllocation,
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
        // IMPORTANTE: NO ponemos totalCostBasis a 0 para poder calcular ROI
        const originalCostBasis = Number(existingHolding.totalCostBasis);
        return await prisma.investmentHolding.update({
          where: { id: existingHolding.id },
          data: {
            totalQuantity: 0,
            totalCostBasis: originalCostBasis, // Mantener el costo original para calcular ROI
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
    const valueByCurrency: { [currency: string]: number } = {};

    allHoldings.forEach((holding) => {
      const priceData = prices.get(holding.assetSymbol);
      if (priceData) {
        const currentValue = priceData.price * Number(holding.totalQuantity);
        const currency = holding.currency;

        if (!valueByCurrency[currency]) {
          valueByCurrency[currency] = 0;
        }
        valueByCurrency[currency] += currentValue;
      }
    });

    return valueByCurrency;
  }

  /**
   * Get portfolio performance history over time
   * Returns an array of data points showing portfolio value at different points in time
   */
  /**
   * Get portfolio performance history using snapshots
   * Uses saved snapshots from transactions for accurate historical data
   */
  async getPortfolioPerformanceHistory(
    userId: string,
    accountId: string,
    period: '1M' | '3M' | '6M' | '1Y' | 'ALL' = '1Y'
  ): Promise<
    Array<{
      date: string;
      value: number;
      costBasis: number;
    }>
  > {
    // Verify account ownership
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, type: 'INVESTMENT' },
    });

    if (!account) {
      throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
    }

    console.log(`📊 [Performance] Calculating for account ${accountId}, period: ${period}`);

    // Calculate start date based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case '1M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case '3M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case '1Y':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case 'ALL':
        const firstTransaction = await prisma.investmentTransaction.findFirst({
          where: { accountId },
          orderBy: { transactionDate: 'asc' },
        });
        startDate = firstTransaction
          ? new Date(firstTransaction.transactionDate)
          : new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
    }

    // Get all transactions in the period with snapshots
    const transactions = await prisma.investmentTransaction.findMany({
      where: {
        accountId,
        transactionDate: { gte: startDate },
      },
      orderBy: { transactionDate: 'asc' },
    });

    if (transactions.length === 0) {
      return [];
    }

    // Build data points from transaction snapshots
    const dataPoints: Array<{ date: string; value: number; costBasis: number }> = [];

    // Track accumulated cost basis (capital invested)
    let totalInvestedHistorical = 0;
    let totalWithdrawn = 0;

    // Calculate initial investment before period
    const initialTransactions = await prisma.investmentTransaction.findMany({
      where: {
        accountId,
        transactionDate: { lt: startDate },
      },
      orderBy: { transactionDate: 'asc' },
    });

    for (const tx of initialTransactions) {
      if (tx.type === 'BUY') {
        totalInvestedHistorical += Number(tx.totalAmount) + Number(tx.fees);
      } else if (tx.type === 'SELL') {
        totalWithdrawn += Number(tx.totalAmount) - Number(tx.fees);
      }
    }

    // Process transactions in period
    for (const tx of transactions) {
      // Update cost basis tracking
      if (tx.type === 'BUY') {
        totalInvestedHistorical += Number(tx.totalAmount) + Number(tx.fees);
      } else if (tx.type === 'SELL') {
        totalWithdrawn += Number(tx.totalAmount) - Number(tx.fees);
      }

      // Use snapshot if available
      const portfolioValue = tx.snapshotValue
        ? Number(tx.snapshotValue)
        : 0; // Fallback if snapshot missing

      // Net cost basis = total invested - total withdrawn
      const netCostBasis = totalInvestedHistorical - totalWithdrawn;

      dataPoints.push({
        date: new Date(tx.transactionDate).toISOString().split('T')[0],
        value: portfolioValue,
        costBasis: netCostBasis,
      });
    }

    // Add current data point with live prices
    const summary = await this.calculatePortfolioSummary(userId, accountId);

    dataPoints.push({
      date: now.toISOString().split('T')[0],
      value: summary.totalValue,
      costBasis: totalInvestedHistorical - totalWithdrawn,
    });

    console.log(`✅ [Performance] Generated ${dataPoints.length} data points for account ${accountId}`);
    if (dataPoints.length > 0) {
      console.log(`   First: ${dataPoints[0].date} - Value: ${dataPoints[0].value.toFixed(2)}, Cost: ${dataPoints[0].costBasis.toFixed(2)}`);
      console.log(`   Last: ${dataPoints[dataPoints.length - 1].date} - Value: ${dataPoints[dataPoints.length - 1].value.toFixed(2)}, Cost: ${dataPoints[dataPoints.length - 1].costBasis.toFixed(2)}`);
    }

    // Sample data if too many points (max 100 points)
    if (dataPoints.length > 100) {
      const step = Math.ceil(dataPoints.length / 100);
      return dataPoints.filter((_, index) => index % step === 0);
    }

    return dataPoints;
  }

  /**
   * Get global portfolio summary across all investment accounts
   */
  async getGlobalPortfolioSummary(userId: string): Promise<{
    totalValue: number;
    totalCostBasis: number;
    totalUnrealizedPL: number;
    totalUnrealizedPLPercent: number;
    totalRealizedPL: number;
    totalCash: number;
    totalAccounts: number;
    topPerformer: {
      symbol: string;
      assetType: string;
      roi: number;
      unrealizedPL: number;
    } | null;
    accountBreakdown: Array<{
      accountId: string;
      accountName: string;
      value: number;
      unrealizedPL: number;
      cashBalance: number;
    }>;
  }> {
    // Get all investment accounts for user
    const accounts = await prisma.account.findMany({
      where: {
        userId,
        type: 'INVESTMENT',
      },
      select: {
        id: true,
        name: true,
        balance: true,
      },
    });

    if (accounts.length === 0) {
      return {
        totalValue: 0,
        totalCostBasis: 0,
        totalUnrealizedPL: 0,
        totalUnrealizedPLPercent: 0,
        totalRealizedPL: 0,
        totalCash: 0,
        totalAccounts: 0,
        topPerformer: null,
        accountBreakdown: [],
      };
    }

    let totalValue = 0;
    let totalCostBasis = 0;
    let totalUnrealizedPL = 0;
    let totalRealizedPL = 0;
    let totalCash = 0;
    let topPerformer: {
      symbol: string;
      assetType: string;
      roi: number;
      unrealizedPL: number;
    } | null = null;
    let maxRoi = -Infinity;

    const accountBreakdown = [];

    // Process each account
    for (const account of accounts) {
      const summary = await this.calculatePortfolioSummary(userId, account.id);

      totalValue += summary.totalValue;
      totalCostBasis += summary.totalCostBasis;
      totalUnrealizedPL += summary.totalUnrealizedGainLoss;
      totalRealizedPL += summary.totalRealizedGainLoss;
      totalCash += Number(account.balance);

      accountBreakdown.push({
        accountId: account.id,
        accountName: account.name,
        value: summary.totalValue,
        unrealizedPL: summary.totalUnrealizedGainLoss,
        cashBalance: Number(account.balance),
      });

      // Find top performer across all holdings
      const holdings = await this.getHoldingsByAccount(userId, account.id);
      for (const holding of holdings) {
        const holdingRoi = holding.roi ?? 0;
        if (holdingRoi > maxRoi) {
          maxRoi = holdingRoi;
          topPerformer = {
            symbol: holding.assetSymbol,
            assetType: holding.assetType,
            roi: holdingRoi,
            unrealizedPL: holding.unrealizedGainLoss ?? 0,
          };
        }
      }
    }

    const totalUnrealizedPLPercent =
      totalCostBasis > 0 ? (totalUnrealizedPL / totalCostBasis) * 100 : 0;

    return {
      totalValue,
      totalCostBasis,
      totalUnrealizedPL,
      totalUnrealizedPLPercent,
      totalRealizedPL,
      totalCash,
      totalAccounts: accounts.length,
      topPerformer,
      accountBreakdown,
    };
  }

  /**
   * Calcula dividendos totales para una cuenta o activo específico
   * Usa agregación de Prisma para eficiencia O(1)
   *
   * @param accountId - ID de la cuenta de inversión
   * @param assetSymbol - (Opcional) Símbolo del activo para filtrar dividendos específicos
   * @returns Total de dividendos (suma de totalAmount de transacciones DIVIDEND e INTEREST)
   */
  private async aggregateDividends(
    accountId: string,
    assetSymbol?: string
  ): Promise<number> {
    const whereClause: any = {
      accountId,
      type: { in: ['DIVIDEND', 'INTEREST'] },
    };

    if (assetSymbol) {
      whereClause.assetSymbol = assetSymbol.toUpperCase();
    }

    const result = await prisma.investmentTransaction.aggregate({
      where: whereClause,
      _sum: {
        totalAmount: true,
      },
    });

    return Number(result._sum.totalAmount || 0);
  }
}

export const investmentHoldingService = new InvestmentHoldingService();
