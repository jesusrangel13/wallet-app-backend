import { Request, Response, NextFunction } from 'express';
import { VoiceTransactionService } from '../services/voice/voiceTransaction.service';
import logger from '../utils/logger';

const voiceService = new VoiceTransactionService();

export const parseVoiceTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user!.userId;
        const { text } = req.body;
        logger.debug('[VoiceController] Received body', { body: req.body });
        logger.debug('[VoiceController] Extracted text', { text });

        if (!text) {
            return res.status(400).json({ success: false, message: "Text input is required" });
        }

        const result = await voiceService.parseTransaction(userId, text);

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};
