import { Request, Response, NextFunction } from 'express';
import { VoiceTransactionService } from '../services/voice/voiceTransaction.service';

const voiceService = new VoiceTransactionService();

export const parseVoiceTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user!.userId;
        const { text } = req.body;
        console.log('🎤 [VoiceController] Received body:', JSON.stringify(req.body, null, 2));
        console.log('🎤 [VoiceController] Extracted text:', text);

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
