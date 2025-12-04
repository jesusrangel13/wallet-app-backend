import { Router } from 'express';
import * as transactionController from '../controllers/transaction.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All transaction routes require authentication
router.use(authenticate);

router.post('/', transactionController.createTransaction);
router.post('/bulk-delete', transactionController.bulkDeleteTransactions);
router.get('/', transactionController.getTransactions);
router.get('/by-category', transactionController.getTransactionsByCategory);
router.get('/stats', transactionController.getTransactionStats);
router.get('/recent', transactionController.getRecentTransactions);
router.get('/payees', transactionController.getUniquePayees);
router.get('/:id', transactionController.getTransactionById);
router.put('/:id', transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

export default router;
