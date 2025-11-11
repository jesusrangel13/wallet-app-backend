import { Router } from 'express';
import * as budgetController from '../controllers/budget.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All budget routes require authentication
router.use(authenticate);

router.post('/', budgetController.createBudget);
router.get('/', budgetController.getBudgets);
router.get('/current', budgetController.getCurrentMonthBudget);
router.get('/vs-actual', budgetController.getBudgetVsActual);
router.get('/:id', budgetController.getBudgetById);
router.put('/:id', budgetController.updateBudget);
router.delete('/:id', budgetController.deleteBudget);

export default router;
