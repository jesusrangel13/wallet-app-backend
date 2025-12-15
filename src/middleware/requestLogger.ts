import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

        if (res.statusCode >= 400) {
            logger.error(message);
        } else {
            logger.http(message);
        }

        // Alert if slow
        if (duration > 1000) {
            logger.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`);
        }
    });

    next();
};
