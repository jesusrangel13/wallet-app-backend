import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    // Server
    PORT: z.string().default('5000'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    ALLOWED_ORIGINS: z.string().optional(),

    // Database
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url().optional(), // For Supabase direct connection

    // Security
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().default('7d'),

    // External Services
    GROQ_API_KEY: z.string().optional(), // Voice transaction AI service

    // ── Broker / Investment Integration ──────────────────────────────────────
    // Price Providers
    ALPHA_VANTAGE_API_KEY: z.string().optional(),    // Stock/ETF prices. Free: ~25 req/día
    EXCHANGERATE_API_KEY: z.string().optional(),      // Forex rates
    COINGECKO_API_KEY: z.string().optional(),         // Crypto prices (free tier, key mejora rate limits)

    // Encryption (AES-256-GCM for SnapTrade userSecret)
    // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)").optional(),

    // Admin endpoint for personal Hapi scraper (Fase 6)
    ADMIN_SYNC_SECRET: z.string().min(32).optional(),

    // SnapTrade OAuth (Fase 7)
    SNAPTRADE_CLIENT_ID: z.string().optional(),
    SNAPTRADE_CONSUMER_KEY: z.string().optional(),
    // ─────────────────────────────────────────────────────────────────────────
});

export const env = envSchema.parse(process.env);

