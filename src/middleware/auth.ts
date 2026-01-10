import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(ErrorCodes.AUTH_NO_TOKEN, 401);
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    // Attach user to request
    req.user = decoded;

    next();
  } catch (error) {
    next(new AppError(ErrorCodes.AUTH_INVALID_TOKEN, 401));
  }
};
