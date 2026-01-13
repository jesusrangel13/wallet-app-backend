import { Router } from 'express';
import { env } from '../config/env';
import { prisma } from '../utils/prisma';

const router = Router();

router.get('/', async (req, res) => {
    try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: env.NODE_ENV,
            database: 'connected',
            uptime: process.uptime()
        });
    } catch (error: any) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            environment: env.NODE_ENV,
            database: 'disconnected',
            error: error.message
        });
    }
});

export default router;
