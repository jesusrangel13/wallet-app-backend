/**
 * Prisma Mock Factory
 * Provides mock implementations of Prisma models for testing
 */

import { PrismaClient } from '@prisma/client'
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended'

// Create a deep mock of PrismaClient
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>

// Reset mocks before each test
beforeEach(() => {
  mockReset(prismaMock)
})

// Helper to create mock user
export const mockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$10$hashedpassword',
  currency: 'USD',
  country: 'US',
  language: 'en',
  isVerified: true,
  avatarUrl: null,
  defaultSharedExpenseAccountId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Helper to create mock account
export const mockAccount = (overrides: any = {}) => ({
  id: 'account-123',
  userId: 'user-123',
  name: 'Test Account',
  type: 'CASH' as const,
  balance: 1000,
  currency: 'USD',
  isDefault: false,
  isActive: true,
  isArchived: false,
  color: '#3B82F6',
  creditLimit: null,
  billingDay: null,
  accountNumber: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Helper to create mock transaction
export const mockTransaction = (overrides: any = {}) => ({
  id: 'txn-123',
  userId: 'user-123',
  accountId: 'account-123',
  type: 'EXPENSE' as const,
  amount: 100,
  description: 'Test Transaction',
  date: new Date('2024-01-01'),
  categoryId: null,
  payee: null,
  payer: null,
  receiptUrl: null,
  toAccountId: null,
  sharedExpenseId: null,
  loanId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Helper to create mock category template
export const mockCategoryTemplate = (overrides = {}) => ({
  id: 'cat-123',
  name: 'Food & Dining',
  icon: '🍔',
  color: '#FF5733',
  type: 'EXPENSE' as const,
  parentTemplateId: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Helper to create mock tag
export const mockTag = (overrides = {}) => ({
  id: 'tag-123',
  userId: 'user-123',
  name: 'Test Tag',
  color: '#3498db',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Helper to create mock loan
export const mockLoan = (overrides: any = {}) => ({
  id: 'loan-123',
  userId: 'user-123',
  borrowerName: 'Test Borrower',
  borrowerUserId: 'user-456',
  originalAmount: 500,
  paidAmount: 0,
  currency: 'USD',
  loanDate: new Date('2024-01-01'),
  notes: null,
  status: 'ACTIVE' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Helper to create mock shared expense
export const mockSharedExpense = (overrides = {}) => ({
  id: 'shared-123',
  groupId: 'group-123',
  description: 'Test Shared Expense',
  totalAmount: 300,
  date: new Date('2024-01-01'),
  paidByUserId: 'user-123',
  categoryId: null,
  receiptUrl: null,
  splitMethod: 'EQUAL' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

export default prismaMock
