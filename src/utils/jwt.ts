import { sign, verify, Secret } from 'jsonwebtoken';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'your-secret-key';

export interface TokenPayload {
  userId: string;
}

export const generateToken = (userId: string): string => {
  // Using any to bypass strict type checking for expiresIn
  // This is a known issue with some versions of @types/jsonwebtoken
  return sign(
    { userId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as any
  );
};

export const verifyToken = (token: string): TokenPayload => {
  return verify(token, JWT_SECRET) as TokenPayload;
};
