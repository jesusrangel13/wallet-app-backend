import { Router } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// Unified summary endpoint (returns all widget data in one request)
router.get('/summary', dashboardController.getDashboardSummary);

// Individual endpoints
router.get('/cashflow', dashboardController.getCashFlow);
router.get('/expenses-by-category', dashboardController.getExpensesByCategory);
router.get('/balance-history', dashboardController.getBalanceHistory);
router.get('/group-balances', dashboardController.getGroupBalances);
router.get('/account-balances', dashboardController.getAccountBalances);

export default router;
