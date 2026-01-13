/**
 * Tests for TransactionService
 * Tests transaction creation, updates, deletion, and queries
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { mockDeep } from 'jest-mock-extended'

// Create mocks BEFORE any imports
const prismaMock = mockDeep<PrismaClient>()
const categoryResolverMock = {
  resolveCategoryById: jest.fn<() => Promise<string | null>>(),
  resolveCategoryByDescription: jest.fn<() => Promise<string | null>>(),
}
const summaryServiceMock = {
  updateMonthlySummary: jest.fn<() => Promise<void>>(),
}

// Mock modules BEFORE importing the service
jest.mock('../../utils/prisma', () => ({
  prisma: prismaMock,
}))
jest.mock('../categoryResolver.service', () => categoryResolverMock)
jest.mock('../summary.service', () => summaryServiceMock)

// NOW import the service and other dependencies
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getRecentTransactions,
} from '../transaction.service'
import { mockUser, mockAccount, mockTransaction, mockTag } from '../../__tests__/mocks/prisma'
import { AppError } from '../../middleware/errorHandler'
import { ErrorCodes } from '../../constants/errorCodes'

describe('TransactionService', () => {
  const userId = 'user-123'
  const accountId = 'account-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createTransaction', () => {
    const user = mockUser({ id: userId })
    const account = mockAccount({ id: accountId, userId, balance: 1000 })

    it('should create an expense transaction and update account balance', async () => {
      const transactionData = {
        accountId,
        type: 'EXPENSE' as const,
        amount: 100,
        description: 'Groceries',
        date: '2024-01-15',
      }

      const createdTransaction = mockTransaction({
        ...transactionData,
        userId,
        payer: user.name,
      })

      // Mock all parallel queries
      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.resolveCategoryById.mockResolvedValue(null)
      prismaMock.tag.findMany.mockResolvedValue([])

      prismaMock.transaction.create.mockResolvedValue(createdTransaction)
      prismaMock.account.update.mockResolvedValue({ ...account, balance: 900 })
      summaryServiceMock.updateMonthlySummary.mockResolvedValue(undefined)

      const result = await createTransaction(userId, transactionData)

      // Verify transaction creation
      expect(prismaMock.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          accountId,
          type: 'EXPENSE',
          amount: 100,
          description: 'Groceries',
          payer: user.name,
        }),
        include: expect.any(Object),
      })

      // Verify balance update (1000 - 100 = 900)
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { balance: 900 },
      })

      // Verify summary update
      expect(summaryServiceMock.updateMonthlySummary).toHaveBeenCalledWith(
        userId,
        expect.any(Number),
        expect.any(Number)
      )

      expect(result).toEqual(createdTransaction)
    })

    it('should create an income transaction and increase account balance', async () => {
      const transactionData = {
        accountId,
        type: 'INCOME' as const,
        amount: 500,
        description: 'Salary',
      }

      const createdTransaction = mockTransaction({
        ...transactionData,
        userId,
      })

      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.resolveCategoryById.mockResolvedValue(null)
      prismaMock.tag.findMany.mockResolvedValue([])

      prismaMock.transaction.create.mockResolvedValue(createdTransaction)
      prismaMock.account.update.mockResolvedValue({ ...account, balance: 1500 })
      summaryServiceMock.updateMonthlySummary.mockResolvedValue(undefined)

      await createTransaction(userId, transactionData)

      // Verify balance update (1000 + 500 = 1500)
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { balance: 1500 },
      })
    })

    it('should create a transfer between accounts', async () => {
      const toAccount = mockAccount({ id: 'account-456', userId, balance: 500 })
      const transactionData = {
        accountId,
        type: 'TRANSFER' as const,
        amount: 200,
        description: 'Transfer to savings',
        toAccountId: toAccount.id,
      }

      const createdTransaction = mockTransaction({
        ...transactionData,
        userId,
      })

      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(toAccount)
      categoryResolverMock.resolveCategoryById.mockResolvedValue(null)
      prismaMock.tag.findMany.mockResolvedValue([])

      prismaMock.transaction.create.mockResolvedValue(createdTransaction)
      prismaMock.account.update
        .mockResolvedValueOnce({ ...account, balance: 800 }) // Source account
        .mockResolvedValueOnce({ ...toAccount, balance: 700 }) // Target account
      summaryServiceMock.updateMonthlySummary.mockResolvedValue(undefined)

      await createTransaction(userId, transactionData)

      // Verify both accounts were updated
      expect(prismaMock.account.update).toHaveBeenCalledTimes(2)
      expect(prismaMock.account.update).toHaveBeenNthCalledWith(1, {
        where: { id: accountId },
        data: { balance: 800 }, // 1000 - 200
      })
      expect(prismaMock.account.update).toHaveBeenNthCalledWith(2, {
        where: { id: toAccount.id },
        data: { balance: 700 }, // 500 + 200
      })
    })

    it('should throw error when account not found', async () => {
      const transactionData = {
        accountId: 'non-existent',
        type: 'EXPENSE' as const,
        amount: 100,
      }

      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(null)
      categoryResolverMock.resolveCategoryById.mockResolvedValue(null)
      prismaMock.tag.findMany.mockResolvedValue([])

      await expect(createTransaction(userId, transactionData)).rejects.toThrow(AppError)
      await expect(createTransaction(userId, transactionData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.ACCOUNT_NOT_FOUND,
        })
      )
    })

    it('should throw error for transfer without toAccountId', async () => {
      const transactionData = {
        accountId,
        type: 'TRANSFER' as const,
        amount: 100,
      }

      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.resolveCategoryById.mockResolvedValue(null)
      prismaMock.tag.findMany.mockResolvedValue([])

      await expect(createTransaction(userId, transactionData)).rejects.toThrow(AppError)
    })

    it('should attach tags to transaction', async () => {
      const tags = [mockTag({ id: 'tag-1', name: 'Food' }), mockTag({ id: 'tag-2', name: 'Groceries' })]
      const transactionData = {
        accountId,
        type: 'EXPENSE' as const,
        amount: 100,
        tags: ['tag-1', 'tag-2'],
      }

      const createdTransaction = mockTransaction({
        ...transactionData,
        userId,
      })

      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.resolveCategoryById.mockResolvedValue(null)
      prismaMock.tag.findMany.mockResolvedValue(tags)

      prismaMock.transaction.create.mockResolvedValue(createdTransaction)
      prismaMock.account.update.mockResolvedValue({ ...account, balance: 900 })
      summaryServiceMock.updateMonthlySummary.mockResolvedValue(undefined)

      await createTransaction(userId, transactionData)

      expect(prismaMock.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tags: {
            connect: [{ id: 'tag-1' }, { id: 'tag-2' }],
          },
        }),
        include: expect.any(Object),
      })
    })
  })

  describe('getTransactions', () => {
    it('should get transactions with default pagination', async () => {
      const transactions = [
        mockTransaction({ id: 'txn-1' }),
        mockTransaction({ id: 'txn-2' }),
      ]

      prismaMock.transaction.count.mockResolvedValue(2)
      prismaMock.transaction.findMany.mockResolvedValue(transactions)

      const result = await getTransactions(userId, {})

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
        orderBy: { date: 'desc' },
        skip: 0,
        take: 50, // Default limit
      })

      expect(result).toEqual({
        data: transactions,
        total: 2,
        page: 1,
        limit: 50,
        totalPages: 1,
        hasMore: false,
      })
    })

    it('should filter transactions by type', async () => {
      const transactions = [mockTransaction({ type: 'EXPENSE' })]

      prismaMock.transaction.count.mockResolvedValue(1)
      prismaMock.transaction.findMany.mockResolvedValue(transactions)

      await getTransactions(userId, { type: 'EXPENSE' })

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          type: 'EXPENSE',
        },
        include: expect.any(Object),
        orderBy: { date: 'desc' },
        skip: 0,
        take: 50,
      })
    })

    it('should filter transactions by date range', async () => {
      const startDate = '2024-01-01'
      const endDate = '2024-01-31'

      prismaMock.transaction.count.mockResolvedValue(0)
      prismaMock.transaction.findMany.mockResolvedValue([])

      await getTransactions(userId, { startDate, endDate })

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: expect.any(Object),
        orderBy: { date: 'desc' },
        skip: 0,
        take: 50,
      })
    })

    it('should filter transactions by amount range', async () => {
      prismaMock.transaction.count.mockResolvedValue(0)
      prismaMock.transaction.findMany.mockResolvedValue([])

      await getTransactions(userId, { minAmount: 50, maxAmount: 200 })

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          amount: {
            gte: 50,
            lte: 200,
          },
        },
        include: expect.any(Object),
        orderBy: { date: 'desc' },
        skip: 0,
        take: 50,
      })
    })

    it('should handle pagination correctly', async () => {
      prismaMock.transaction.count.mockResolvedValue(100)
      prismaMock.transaction.findMany.mockResolvedValue([])

      const result = await getTransactions(userId, { page: 3, limit: 20 })

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
        orderBy: { date: 'desc' },
        skip: 40, // (3-1) * 20
        take: 20,
      })

      expect(result.page).toBe(3)
      expect(result.limit).toBe(20)
      expect(result.totalPages).toBe(5) // 100 / 20
      expect(result.hasMore).toBe(true)
    })
  })

  describe('getTransactionById', () => {
    it('should get transaction by id', async () => {
      const transaction = mockTransaction({ id: 'txn-123', userId })

      prismaMock.transaction.findFirst.mockResolvedValue(transaction)

      const result = await getTransactionById(userId, 'txn-123')

      expect(prismaMock.transaction.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'txn-123',
          userId,
        },
        include: expect.any(Object),
      })
      expect(result).toEqual(transaction)
    })

    it('should throw error when transaction not found', async () => {
      prismaMock.transaction.findFirst.mockResolvedValue(null)

      await expect(getTransactionById(userId, 'non-existent')).rejects.toThrow(AppError)
      await expect(getTransactionById(userId, 'non-existent')).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.TRANSACTION_NOT_FOUND,
        })
      )
    })
  })

  describe('deleteTransaction', () => {
    it('should soft delete transaction and update account balance', async () => {
      const transaction = mockTransaction({
        id: 'txn-123',
        userId,
        accountId,
        type: 'EXPENSE',
        amount: 100,
      })
      const account = mockAccount({ id: accountId, userId, balance: 900 })

      prismaMock.transaction.findFirst.mockResolvedValue(transaction)
      prismaMock.account.findFirst.mockResolvedValue(account)
      prismaMock.transaction.delete.mockResolvedValue(transaction)
      prismaMock.account.update.mockResolvedValue({ ...account, balance: 1000 })
      summaryServiceMock.updateMonthlySummary.mockResolvedValue(undefined)

      await deleteTransaction(userId, 'txn-123')

      // Verify transaction deleted
      expect(prismaMock.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'txn-123' },
      })

      // Verify balance restored (900 + 100 = 1000)
      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: { balance: 1000 },
      })

      // Verify summary updated
      expect(summaryServiceMock.updateMonthlySummary).toHaveBeenCalled()
    })

    it('should throw error when transaction not found', async () => {
      prismaMock.transaction.findFirst.mockResolvedValue(null)

      await expect(deleteTransaction(userId, 'non-existent')).rejects.toThrow(AppError)
    })
  })

  describe('getRecentTransactions', () => {
    it('should get recent transactions with default limit', async () => {
      const transactions = [
        mockTransaction({ id: 'txn-1', date: new Date('2024-01-10') }),
        mockTransaction({ id: 'txn-2', date: new Date('2024-01-09') }),
      ]

      prismaMock.transaction.findMany.mockResolvedValue(transactions)

      const result = await getRecentTransactions(userId)

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 5, // Default limit
        include: expect.any(Object),
      })
      expect(result).toEqual(transactions)
    })

    it('should respect custom limit', async () => {
      prismaMock.transaction.findMany.mockResolvedValue([])

      await getRecentTransactions(userId, 10)

      expect(prismaMock.transaction.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 10,
        include: expect.any(Object),
      })
    })
  })
})
