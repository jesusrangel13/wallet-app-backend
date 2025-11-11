import { Router } from 'express';
import * as sharedExpenseController from '../controllers/sharedExpense.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All shared expense routes require authentication
router.use(authenticate);

router.post('/', sharedExpenseController.createSharedExpense);
router.get('/', sharedExpenseController.getSharedExpenses);
router.get('/:id', sharedExpenseController.getSharedExpenseById);
router.delete('/:id', sharedExpenseController.deleteSharedExpense);
router.post('/payments', sharedExpenseController.settlePayment);
router.get('/payments/history', sharedExpenseController.getPaymentHistory);
router.get('/groups/:groupId/simplified-debts', sharedExpenseController.calculateSimplifiedDebts);
router.patch('/:id/participants/:participantUserId/mark-paid', sharedExpenseController.markParticipantAsPaid);
router.patch('/:id/participants/:participantUserId/mark-unpaid', sharedExpenseController.markParticipantAsUnpaid);

export default router;
