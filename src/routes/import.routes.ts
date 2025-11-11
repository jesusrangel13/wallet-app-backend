import { Router } from 'express';
import * as importController from '../controllers/import.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All import routes require authentication
router.use(authenticate);

// Import transactions
router.post('/', importController.importTransactions);

// Get all import history
router.get('/history', importController.getImportHistory);

// Get specific import details
router.get('/history/:id', importController.getImportHistoryById);

export default router;
