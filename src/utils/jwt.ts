import { sign, verify, Secret, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

const JWT_SECRET: Secret = env.JWT_SECRET;

export interface TokenPayload {
  userId: string;
}

export const generateToken = (userId: string): string => {
  // NOTE: Using 'as any' here is INTENTIONAL and SAFE
  // Reason: @types/jsonwebtoken type definitions are outdated/incorrect
  // The JWT library DOES accept string values like "7d" for expiresIn
  // but TypeScript types only allow number | StringValue (which excludes plain strings)
  // This is a known limitation of the type definitions, not our code
  return sign(
    { userId },
    JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as any
  );
};

export const verifyToken = (token: string): TokenPayload => {
  return verify(token, JWT_SECRET) as TokenPayload;
};
