import { Express } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: any; // Replace 'any' with your User type/interface (e.g., JwtPayload)
    }
  }
}
