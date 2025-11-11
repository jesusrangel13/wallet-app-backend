import { Router } from 'express';
import * as groupController from '../controllers/group.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All group routes require authentication
router.use(authenticate);

router.post('/', groupController.createGroup);
router.get('/', groupController.getGroups);
router.get('/:id', groupController.getGroupById);
router.put('/:id', groupController.updateGroup);
router.delete('/:id', groupController.deleteGroup);
router.post('/:id/members', groupController.addMember);
router.delete('/:id/members/:memberId', groupController.removeMember);
router.get('/:id/balances', groupController.getGroupBalances);
router.put('/:id/default-split', groupController.updateDefaultSplit);
router.post('/:id/settle-balance', groupController.settleAllBalance);

export default router;
