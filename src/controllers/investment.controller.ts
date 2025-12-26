import { Request, Response } from 'express';
import { investmentTransactionService } from '../services/investment-transaction.service';
import { investmentHoldingService } from '../services/investment-holding.service';
import { priceProviderService } from '../services/price-provider.service';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

/**
 * Crear una nueva transacción de inversión (BUY/SELL)
 */
export const createTransaction = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = req.body;

  const transaction = await investmentTransactionService.createTransaction(userId, data);

  res.status(201).json({
    success: true,
    data: transaction,
  });
};

/**
 * Obtener transacciones con filtros
 */
export const getTransactions = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const {
    accountId,
    assetSymbol,
    type,
    dateFrom,
    dateTo,
    page,
    limit,
  } = req.query;

  const filters = {
    accountId: accountId as string | undefined,
    assetSymbol: assetSymbol as string | undefined,
    type: type as any,
    dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
    dateTo: dateTo ? new Date(dateTo as string) : undefined,
    page: page ? parseInt(page as string) : undefined,
    limit: limit ? parseInt(limit as string) : undefined,
  };

  const result = await investmentTransactionService.getTransactionsByAccount(
    userId,
    filters
  );

  res.json({
    success: true,
    data: result.transactions,
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit,
      pages: Math.ceil(result.total / result.limit),
    },
  });
};

/**
 * Obtener una transacción específica
 */
export const getTransactionById = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  const transaction = await investmentTransactionService.getTransactionById(
    userId,
    id
  );

  res.json({
    success: true,
    data: transaction,
  });
};

/**
 * Eliminar una transacción
 */
export const deleteTransaction = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { id } = req.params;

  await investmentTransactionService.deleteTransaction(userId, id);

  res.json({
    success: true,
    message: 'Investment transaction deleted successfully',
  });
};

/**
 * Obtener holdings de una cuenta
 */
export const getHoldings = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { accountId } = req.params;

  const holdings = await investmentHoldingService.getHoldingsByAccount(
    userId,
    accountId
  );

  res.json({
    success: true,
    data: holdings,
  });
};

/**
 * Obtener holding específico por símbolo
 */
export const getHoldingBySymbol = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { accountId, symbol } = req.params;

  const holding = await investmentHoldingService.getHoldingBySymbol(
    userId,
    accountId,
    symbol
  );

  if (!holding) {
    throw new AppError(ErrorCodes.ENTITY_NOT_FOUND, 404);
  }

  res.json({
    success: true,
    data: holding,
  });
};

/**
 * Obtener resumen del portafolio
 */
export const getPortfolioSummary = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { accountId } = req.params;

  const summary = await investmentHoldingService.calculatePortfolioSummary(
    userId,
    accountId
  );

  res.json({
    success: true,
    data: summary,
  });
};

/**
 * Obtener precio actual de un activo
 */
export const getCurrentPrice = async (req: Request, res: Response) => {
  const { symbol, type } = req.params;

  const price = await priceProviderService.getCurrentPrice(
    symbol,
    type as any
  );

  res.json({
    success: true,
    data: price,
  });
};

/**
 * Obtener múltiples precios en batch
 */
export const getBatchPrices = async (req: Request, res: Response) => {
  const { symbols } = req.body;

  if (!Array.isArray(symbols)) {
    throw new AppError(ErrorCodes.INVALID_INPUT, 400);
  }

  const prices = await priceProviderService.getBatchPrices(symbols);

  // Convertir Map a objeto para JSON
  const pricesObject: any = {};
  prices.forEach((value, key) => {
    pricesObject[key] = value;
  });

  res.json({
    success: true,
    data: pricesObject,
  });
};

/**
 * Buscar activos
 */
export const searchAssets = async (req: Request, res: Response) => {
  const { query, assetType } = req.query;

  if (!query || typeof query !== 'string') {
    throw new AppError(ErrorCodes.INVALID_INPUT, 400);
  }

  const results = await priceProviderService.searchAsset(
    query,
    assetType as any
  );

  res.json({
    success: true,
    data: results,
  });
};
