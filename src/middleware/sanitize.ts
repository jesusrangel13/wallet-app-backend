import { Request, Response, NextFunction } from 'express';
import { sanitizeObject } from '../utils/sanitizer';

/**
 * Global sanitization middleware
 * Sanitizes all user input from req.body, req.query, and req.params
 * to prevent XSS attacks by stripping HTML tags and dangerous content
 */
export const sanitizeMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    // If sanitization fails, log error but continue
    // This prevents the middleware from breaking the app
    console.error('❌ Sanitization middleware error:', error);
    next();
  }
};
