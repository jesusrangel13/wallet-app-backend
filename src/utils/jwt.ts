import { sign, verify, Secret } from 'jsonwebtoken';
import { env } from '../config/env';

const JWT_SECRET: Secret = env.JWT_SECRET;

export interface TokenPayload {
  userId: string;
}

export const generateToken = (userId: string): string => {
  // Using any to bypass strict type checking for expiresIn
  // This is a known issue with some versions of @types/jsonwebtoken
  return sign(
    { userId },
    JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as any
  );
};

export const verifyToken = (token: string): TokenPayload => {
  return verify(token, JWT_SECRET) as TokenPayload;
};
