import { Router } from 'express';
import * as voiceController from '../controllers/voiceTransaction.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/parse', voiceController.parseVoiceTransaction);

export default router;
