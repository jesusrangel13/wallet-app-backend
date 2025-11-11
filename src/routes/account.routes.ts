import { Router } from 'express';
import * as accountController from '../controllers/account.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All account routes require authentication
router.use(authenticate);

router.post('/', accountController.createAccount);
router.get('/', accountController.getAccounts);
router.get('/balance/total', accountController.getTotalBalance);
router.get('/:id', accountController.getAccountById);
router.put('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);
router.get('/:id/balance', accountController.getAccountBalance);

export default router;
