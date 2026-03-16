/**
 * broker.routes.ts
 *
 * Rutas del módulo Broker / Investment Portfolio.
 * La autenticación JWT se aplica en todas las rutas vía `authMiddleware`.
 * El endpoint de admin usa `adminSecretMiddleware` en lugar de JWT.
 *
 * Controllers stub en Fase 1 → implementación real en Fases 2 y 3.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import * as brokerController from '../controllers/broker.controller';
import { env } from '../config/env';

const router = Router();

// ─── Middleware de admin para el endpoint del scraper personal ───────────────
const adminSecretMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const secret = req.headers['x-admin-secret'];
    if (!env.ADMIN_SYNC_SECRET || !secret || secret !== env.ADMIN_SYNC_SECRET) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return next();
};

// ─── Rutas protegidas con JWT ────────────────────────────────────────────────

/**
 * @swagger
 * /brokers/accounts/{accountId}/upload:
 *   post:
 *     summary: Upload Hapi CSV file for portfolio sync
 *     tags: [Brokers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Sync result with positions and transactions counts
 *       501:
 *         description: Not implemented yet
 */
router.post(
    '/accounts/:accountId/upload',
    authenticate,
    brokerController.uploadHapiCsv
);

/**
 * @swagger
 * /brokers/accounts/{accountId}/positions:
 *   get:
 *     summary: Get current investment positions for a broker account
 *     tags: [Brokers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Array of investment positions with live prices
 *       501:
 *         description: Not implemented yet
 */
router.get('/accounts/:accountId/positions', authenticate, brokerController.getPositions);

/**
 * @swagger
 * /brokers/accounts/{accountId}/transactions:
 *   get:
 *     summary: Get investment transaction history for a broker account
 *     tags: [Brokers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of investment transactions
 *       501:
 *         description: Not implemented yet
 */
router.get('/accounts/:accountId/transactions', authenticate, brokerController.getTransactions);

/**
 * @swagger
 * /brokers/accounts/{accountId}/summary:
 *   get:
 *     summary: Get portfolio summary (total value, P&L, etc.)
 *     tags: [Brokers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio summary object
 *       501:
 *         description: Not implemented yet
 */
router.get('/accounts/:accountId/summary', authenticate, brokerController.getPortfolioSummary);

/**
 * @swagger
 * /brokers/prices/{ticker}/{type}:
 *   get:
 *     summary: Get current price for a specific asset
 *     tags: [Brokers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema: { type: string }
 *         example: AAPL
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [STOCK, ETF, CRYPTO, FOREX]
 *     responses:
 *       200:
 *         description: Current price data
 *       501:
 *         description: Not implemented yet
 */
router.get('/prices/:ticker/:type', authenticate, brokerController.getAssetPrice);

/**
 * @swagger
 * /brokers/search:
 *   get:
 *     summary: Search for assets by symbol or name
 *     tags: [Brokers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [STOCK, ETF, CRYPTO, FOREX]
 *     responses:
 *       200:
 *         description: Array of matching assets
 *       501:
 *         description: Not implemented yet
 */
router.get('/search', authenticate, brokerController.searchAssets);

// ─── Admin endpoint — protegido por X-Admin-Secret (NO JWT de usuario) ───────

/**
 * @swagger
 * /brokers/hapi/admin-sync:
 *   post:
 *     summary: Admin endpoint for personal Hapi scraper (Phase 6)
 *     tags: [Brokers]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-Secret
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sync completed
 *       403:
 *         description: Forbidden — invalid admin secret
 *       501:
 *         description: Not implemented yet
 */
router.post('/hapi/admin-sync', adminSecretMiddleware, brokerController.adminSync);

export default router;
