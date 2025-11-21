import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.delete('/account', userController.deleteAccount);
router.get('/stats', userController.getUserStats);
router.get('/my-balances', userController.getMyBalances);
router.patch('/me/default-shared-expense-account', userController.updateDefaultSharedExpenseAccount);

export default router;
