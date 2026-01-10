import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import { env } from './config/env';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { specs as swaggerSpecs } from './config/swagger';
import { requestLogger } from './middleware/requestLogger';
import { sanitizeMiddleware } from './middleware/sanitize';
import healthRoutes from './routes/health.routes';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transaction.routes';
import budgetRoutes from './routes/budget.routes';
import groupRoutes from './routes/group.routes';
import sharedExpenseRoutes from './routes/sharedExpense.routes';
import categoryRoutes from './routes/category.routes';
import tagRoutes from './routes/tag.routes';
import importRoutes from './routes/import.routes';
import dashboardRoutes from './routes/dashboard.routes';
import notificationRoutes from './routes/notification.routes';
import dashboardPreferenceRoutes from './routes/dashboardPreference.routes';
import loanRoutes from './routes/loan.routes';
import voiceRoutes from './routes/voice.routes';
import { CategoryTemplateService } from './services/categoryTemplate.service';
import logger from './utils/logger';

// Load environment variables (via env.ts)

const app: Application = express();
const PORT = env.PORT;

// Middleware
app.use(helmet());
app.use(requestLogger);

// Enable gzip compression for all responses (reduces payload size by ~70%)
app.use(compression({
  filter: (req: Request, res: Response) => {
    // Don't compress responses with this request header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression filter function
    return compression.filter(req, res);
  },
  level: 6, // Balance between speed and compression ratio
}));

const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (como Postman o mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Input sanitization - Applied globally to prevent XSS attacks
// Sanitizes req.body, req.query, and req.params
app.use(sanitizeMiddleware);

// Health check
app.use('/health', healthRoutes);

import { authLimiter, apiLimiter } from './middleware/rateLimiter';

// API Routes
// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// API Versioning
const v1Router = express.Router();

// Apply auth limiter specifically to auth routes
v1Router.use('/auth', authLimiter, authRoutes);

// Apply general API limiter to all other API routes
v1Router.use(apiLimiter);

v1Router.use('/users', userRoutes);
v1Router.use('/accounts', accountRoutes);
v1Router.use('/transactions', transactionRoutes);
v1Router.use('/categories', categoryRoutes);
v1Router.use('/tags', tagRoutes);
v1Router.use('/budgets', budgetRoutes);
v1Router.use('/groups', groupRoutes);
v1Router.use('/shared-expenses', sharedExpenseRoutes);
v1Router.use('/loans', loanRoutes);
v1Router.use('/import', importRoutes);
v1Router.use('/dashboard', dashboardRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/users', dashboardPreferenceRoutes); // Check if this conflicts with /users above. It seems to be dashboard preferences.
v1Router.use('/voice', voiceRoutes);

// Mount v1 router
app.use('/api/v1', v1Router);

// Alias for backward compatibility
app.use('/api', v1Router);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize category templates (idempotent operation)
(async () => {
  try {
    await CategoryTemplateService.initializeDefaultTemplates();
  } catch (error) {
    logger.error('Failed to initialize category templates:', error);
    // Don't block server startup if this fails
  }
})();

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API Docs: http://localhost:${PORT}/api-docs`);
});

export default app;
