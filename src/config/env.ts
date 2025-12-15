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

    // External Services (Optional purely for validation if referenced)
    // Add others as needed
});

export const env = envSchema.parse(process.env);
