import { Router } from 'express';
import * as tagController from '../controllers/tag.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All tag routes require authentication
router.use(authenticate);

router.post('/', tagController.createTag);
router.get('/', tagController.getTags);
router.get('/:id', tagController.getTagById);
router.put('/:id', tagController.updateTag);
router.delete('/:id', tagController.deleteTag);

export default router;
