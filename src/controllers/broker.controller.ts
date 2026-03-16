import { Request, Response, NextFunction } from 'express';

/**
 * broker.controller.ts — STUB para Fase 1
 *
 * Las implementaciones reales se completan en Fase 3 (Hapi CSV Parser)
 * y Fase 2 (Price Provider). Este stub existe para que el servidor
 * arranque y las rutas queden registradas correctamente.
 */

export const uploadHapiCsv = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 3.' });
};

export const getPositions = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 3.' });
};

export const getTransactions = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 3.' });
};

export const getPortfolioSummary = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 3.' });
};

export const getAssetPrice = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 2.' });
};

export const searchAssets = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 2.' });
};

export const adminSync = async (
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    res.status(501).json({ success: false, message: 'Not implemented yet. Coming in Phase 6.' });
};
