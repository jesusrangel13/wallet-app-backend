import { Router } from 'express';
import * as loanController from '../controllers/loan.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All loan routes require authentication
router.use(authenticate);

// Special routes that need to come before /:id to avoid conflicts
router.get('/summary', loanController.getLoansSummary);
router.get('/by-borrower', loanController.getLoansByBorrower);

// CRUD routes
router.post('/', loanController.createLoan);
router.get('/', loanController.getUserLoans);
router.get('/:id', loanController.getLoanById);
router.delete('/:id', loanController.deleteLoan);

// Loan-specific actions
router.post('/:id/payments', loanController.recordLoanPayment);
router.patch('/:id/cancel', loanController.cancelLoan);

export default router;
