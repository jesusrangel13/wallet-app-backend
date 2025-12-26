import { Router } from 'express';
import * as investmentController from '../controllers/investment.controller';
import { validateBody } from '../middleware/validate';
import {
  createInvestmentTransactionSchema,
  searchAssetsSchema,
} from '../utils/validation';

const router = Router();

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

// Precios
router.get('/prices/current/:symbol/:type', investmentController.getCurrentPrice);

router.post('/prices/batch', investmentController.getBatchPrices);

// Búsqueda
router.get('/search', investmentController.searchAssets);

export default router;
