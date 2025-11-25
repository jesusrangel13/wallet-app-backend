import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
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
import { CategoryTemplateService } from './services/categoryTemplate.service';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

// Middleware
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

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean) || ['http://localhost:3000'];
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/shared-expenses', sharedExpenseRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/import', importRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', dashboardPreferenceRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize category templates (idempotent operation)
(async () => {
  try {
    await CategoryTemplateService.initializeDefaultTemplates();
  } catch (error) {
    console.error('⚠️  Failed to initialize category templates:', error);
    // Don't block server startup if this fails
  }
})();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;
