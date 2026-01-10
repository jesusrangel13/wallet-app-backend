import { Request, Response, NextFunction } from 'express';
import { ErrorCodes, type ErrorCode } from '../constants/errorCodes';
import logger from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  errorCode: ErrorCode;

  constructor(errorCode: ErrorCode, statusCode: number, message?: string) {
    super(message || errorCode);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      errorCode: err.errorCode,
      message: err.message
    });
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    logger.error('Prisma Error', { code: (err as any).code, meta: (err as any).meta });
    return res.status(400).json({
      status: 'error',
      errorCode: ErrorCodes.DATABASE_ERROR,
      message: 'Database error occurred'
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      status: 'error',
      errorCode: ErrorCodes.AUTH_INVALID_TOKEN,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      status: 'error',
      errorCode: ErrorCodes.AUTH_TOKEN_EXPIRED,
      message: 'Token expired'
    });
  }

  // Generic error
  logger.error('Unhandled error', { error: err });

  res.status(500).json({
    status: 'error',
    errorCode: ErrorCodes.INTERNAL_SERVER_ERROR,
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal server error'
  });
};
