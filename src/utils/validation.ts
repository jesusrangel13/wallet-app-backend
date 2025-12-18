import { z } from 'zod';

// User schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  currency: z.enum(['CLP', 'USD', 'EUR']).optional().default('CLP'),
  country: z.string().optional(),
  language: z.enum(['es', 'en', 'fr', 'pt', 'it', 'de']).optional().default('es'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Account schemas
const baseAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  type: z.enum(['CASH', 'DEBIT', 'CREDIT', 'SAVINGS', 'INVESTMENT']),
  balance: z.number().default(0),
  currency: z.enum(['CLP', 'USD', 'EUR']).default('CLP'),
  isDefault: z.boolean().optional().default(false),
  includeInTotalBalance: z.boolean().optional().default(true),
  // Additional account fields
  accountNumber: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().regex(/^\d+$/, 'Account number must contain only numbers').optional()
  ),
  color: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color').optional()
  ),
  // Credit card specific fields
  creditLimit: z.number().positive().optional(),
  billingDay: z.number().min(1).max(31).optional(),
});

export const createAccountSchema = baseAccountSchema.refine(
  (data) => {
    // If type is CREDIT, creditLimit and billingDay are required
    if (data.type === 'CREDIT') {
      return data.creditLimit !== undefined && data.billingDay !== undefined;
    }
    return true;
  },
  {
    message: 'Credit limit and billing day are required for credit card accounts',
    path: ['creditLimit'],
  }
);

export const updateAccountSchema = baseAccountSchema.partial();

// Tag schemas
export const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(50, 'Tag name too long'),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid color format').optional(),
});

export const updateTagSchema = createTagSchema.partial();

// Transaction schemas
const baseTransactionSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  amount: z.number().positive('Amount must be positive'),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  description: z.string().optional(),
  date: z.string().optional().or(z.literal('')),
  receiptUrl: z.string().url().optional().or(z.literal('')).optional(),
  payee: z.string().optional(), // Who received the payment
  payer: z.string().optional(), // Who made the payment
  toAccountId: z.string().uuid('Invalid destination account ID').optional(), // For transfers
  sharedExpenseId: z.string().uuid('Invalid shared expense ID').nullish(),
  tags: z.array(z.string().uuid()).optional(), // Array of tag IDs
});

export const createTransactionSchema = baseTransactionSchema.refine(
  (data) => {
    // If type is TRANSFER, toAccountId is required
    if (data.type === 'TRANSFER') {
      return data.toAccountId !== undefined;
    }
    return true;
  },
  {
    message: 'Destination account is required for transfers',
    path: ['toAccountId'],
  }
);

export const updateTransactionSchema = baseTransactionSchema.partial();

// Budget schemas
export const createBudgetSchema = z.object({
  amount: z.number().positive('Budget amount must be positive'),
  month: z.number().min(1).max(12),
  year: z.number().min(2020),
});

// Group schemas
export const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  coverImageUrl: z.string().optional().or(z.literal('')).optional(), // Can be emoji or URL
  // New fields for single-step creation
  memberEmails: z.array(z.string().email()).optional(), // Emails of members to add
  defaultSplitType: z.enum(['EQUAL', 'PERCENTAGE', 'SHARES', 'EXACT']).optional(),
  // Split configuration per member (using email as identifier)
  memberSplitSettings: z
    .array(
      z.object({
        email: z.string().email(),
        percentage: z.number().min(0).max(100).optional(),
        shares: z.number().int().positive().optional(),
        exactAmount: z.number().positive().optional(),
      })
    )
    .optional(),
});

export const updateGroupSchema = createGroupSchema.partial();

// Shared Expense schemas
export const createSharedExpenseSchema = z.object({
  groupId: z.string().uuid('Invalid group ID'),
  paidByUserId: z.string().uuid('Invalid user ID').optional(), // Allow overriding who paid
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  categoryId: z.string().uuid('Invalid category ID').optional(),
  receiptUrl: z.string().url().optional().or(z.literal('')).optional(),
  splitType: z.enum(['EQUAL', 'PERCENTAGE', 'EXACT', 'SHARES']).default('EQUAL'),
  date: z.string().datetime().optional(),
  participants: z.array(
    z.object({
      userId: z.string().uuid(),
      amountOwed: z.number().optional(),
      percentage: z.number().min(0).max(100).optional(), // 0-100
      shares: z.number().int().positive().optional(),
    })
  ),
});

export const updateSharedExpenseSchema = createSharedExpenseSchema.partial();

// Payment schemas
export const createPaymentSchema = z.object({
  toUserId: z.string().uuid('Invalid user ID'),
  amount: z.number().positive('Amount must be positive'),
  groupId: z.string().uuid().optional(),
});
