/**
 * Zod validation schemas for the Broker/Investment module.
 * Used by broker.controller.ts and broker.routes.ts for request validation.
 */
import { z } from 'zod';

// ─── Enums (must match Prisma schema) ────────────────────────────────────────

export const BrokerSyncMethodEnum = z.enum(['CSV_UPLOAD', 'SCRAPER_BOT', 'SNAPTRADE_API']);
export const InvestmentAssetTypeEnum = z.enum(['STOCK', 'ETF', 'CRYPTO', 'FOREX']);
export const InvestmentTransactionTypeEnum = z.enum([
    'BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE',
]);

// ─── CSV Upload ───────────────────────────────────────────────────────────────

export const uploadHapiCsvSchema = z.object({
    accountId: z.string().uuid({ message: 'accountId must be a valid UUID' }),
});
export type UploadHapiCsvInput = z.infer<typeof uploadHapiCsvSchema>;

// ─── Create Broker Account ────────────────────────────────────────────────────

export const createBrokerAccountSchema = z.object({
    name: z.string().min(1).max(100),
    brokerName: z.string().min(1).max(50),
    brokerSyncMethod: BrokerSyncMethodEnum,
    currency: z.string().length(3).default('USD'),
});
export type CreateBrokerAccountInput = z.infer<typeof createBrokerAccountSchema>;

// ─── Sync Position (admin manual update) ─────────────────────────────────────

export const syncPositionSchema = z.object({
    ticker: z.string().min(1).max(20).transform(v => v.toUpperCase()),
    assetType: InvestmentAssetTypeEnum,
    shares: z.number().positive(),
    averageCost: z.number().positive(),
    currency: z.string().length(3).default('USD'),
});
export type SyncPositionInput = z.infer<typeof syncPositionSchema>;

// ─── Position Queries ─────────────────────────────────────────────────────────

export const accountIdParamSchema = z.object({
    accountId: z.string().uuid({ message: 'accountId must be a valid UUID' }),
});
export type AccountIdParam = z.infer<typeof accountIdParamSchema>;

// ─── Asset Search ─────────────────────────────────────────────────────────────

export const assetSearchSchema = z.object({
    q: z.string().min(1).max(20),
    type: InvestmentAssetTypeEnum.optional(),
});
export type AssetSearchInput = z.infer<typeof assetSearchSchema>;

// ─── Price Query ──────────────────────────────────────────────────────────────

export const priceQuerySchema = z.object({
    ticker: z
        .string()
        .min(1)
        .max(20)
        // Bloquea caracteres especiales para prevenir CSV injection en logs
        .regex(/^[A-Z0-9\-\.]+$/i, 'Ticker must be alphanumeric (letters, digits, hyphens, dots)'),
    type: InvestmentAssetTypeEnum,
});
export type PriceQueryInput = z.infer<typeof priceQuerySchema>;

// ─── Account Broker Fields (para AccountFormModal) ───────────────────────────

export const brokerAccountFieldsSchema = z.object({
    isBrokerAccount: z.boolean().optional(),
    brokerName: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9\s\-\.]+$/, 'Broker name contains invalid characters')
        .optional(),
    brokerSyncMethod: BrokerSyncMethodEnum.optional(),
});
export type BrokerAccountFields = z.infer<typeof brokerAccountFieldsSchema>;
