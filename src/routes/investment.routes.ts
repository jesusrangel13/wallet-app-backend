import { Router } from 'express';
import * as investmentController from '../controllers/investment.controller';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  createInvestmentTransactionSchema,
  searchAssetsSchema,
  importInvestmentTransactionsSchema,
} from '../utils/validation';

const router = Router();

// All investment routes require authentication
router.use(authenticate);

// Global summary
router.get('/summary', investmentController.getGlobalPortfolioSummary);

// Transacciones
router.post(
  '/transactions',
  validateBody(createInvestmentTransactionSchema),
  investmentController.createTransaction
);

router.get('/transactions', investmentController.getTransactions);

router.get('/transactions/:id', investmentController.getTransactionById);

router.delete('/transactions/:id', investmentController.deleteTransaction);

// Holdings
router.get('/accounts/:accountId/holdings', investmentController.getHoldings);

router.get(
  '/accounts/:accountId/holdings/:symbol',
  investmentController.getHoldingBySymbol
);

router.get(
  '/accounts/:accountId/summary',
  investmentController.getPortfolioSummary
);

router.get(
  '/accounts/:accountId/performance',
  investmentController.getPortfolioPerformance
);

// Precios
router.get('/prices/current/:symbol/:type', investmentController.getCurrentPrice);

router.post('/prices/batch', investmentController.getBatchPrices);

// Búsqueda
router.get('/search', investmentController.searchAssets);

// Importación
router.post(
  '/import',
  validateBody(importInvestmentTransactionsSchema),
  investmentController.importInvestmentTransactions
);

router.get('/import/history', investmentController.getInvestmentImportHistory);

router.get('/import/history/:id', investmentController.getInvestmentImportById);

export default router;
