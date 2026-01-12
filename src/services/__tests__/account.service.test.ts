/**
 * Tests for AccountService
 * Tests account creation, updates, deletion, and balance queries
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  getTotalBalance,
} from '../account.service'
import { prismaMock, mockAccount } from '../../__tests__/mocks/prisma'
import { AppError } from '../../middleware/errorHandler'
import { ErrorCodes } from '../../constants/errorCodes'

// Mock dependencies
jest.mock('../../utils/prisma', () => ({
  prisma: prismaMock,
}))

describe('AccountService', () => {
  const userId = 'user-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createAccount', () => {
    const accountData = {
      name: 'Main Checking',
      type: 'CASH' as const,
      balance: 1000,
      currency: 'USD',
    }

    it('should create a new account', async () => {
      const createdAccount = mockAccount({
        ...accountData,
        userId,
        color: expect.any(String),
      })

      prismaMock.account.create.mockResolvedValue(createdAccount)

      const result = await createAccount(userId, accountData)

      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          name: accountData.name,
          type: accountData.type,
          balance: accountData.balance,
          currency: accountData.currency,
          isDefault: false,
        }),
      })
      expect(result).toEqual(createdAccount)
    })

    it('should use default values for optional fields', async () => {
      const minimalData = {
        name: 'New Account',
        type: 'CASH' as const,
      }

      prismaMock.account.create.mockResolvedValue(mockAccount(minimalData))

      await createAccount(userId, minimalData)

      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          balance: 0, // Default
          currency: 'USD', // Default
          isDefault: false, // Default
          color: expect.any(String), // Generated
        }),
      })
    })

    it('should generate random color if not provided', async () => {
      prismaMock.account.create.mockResolvedValue(mockAccount())

      await createAccount(userId, accountData)

      const createCall = prismaMock.account.create.mock.calls[0][0]
      expect(createCall.data.color).toMatch(/^#[0-9A-F]{6}$/i)
    })

    it('should use provided color', async () => {
      const customColor = '#FF5733'
      const dataWithColor = { ...accountData, color: customColor }

      prismaMock.account.create.mockResolvedValue(mockAccount({ color: customColor }))

      await createAccount(userId, dataWithColor)

      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          color: customColor,
        }),
      })
    })

    it('should unset other defaults when isDefault is true', async () => {
      const defaultAccountData = { ...accountData, isDefault: true }

      prismaMock.account.updateMany.mockResolvedValue({ count: 1 })
      prismaMock.account.create.mockResolvedValue(mockAccount({ isDefault: true }))

      await createAccount(userId, defaultAccountData)

      expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      })
      expect(prismaMock.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isDefault: true,
        }),
      })
    })
  })

  describe('getAccounts', () => {
    it('should get all accounts with default pagination', async () => {
      const accounts = [
        mockAccount({ id: 'acc-1', userId }),
        mockAccount({ id: 'acc-2', userId }),
      ]

      prismaMock.account.count.mockResolvedValue(2)
      prismaMock.account.findMany.mockResolvedValue(accounts)

      const result = await getAccounts(userId)

      expect(prismaMock.account.findMany).toHaveBeenCalledWith({
        where: { userId, isArchived: false },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: 0,
        take: 50, // Default limit
      })

      expect(result.data).toEqual(accounts)
      expect(result.pagination).toEqual({
        currentPage: 1,
        pageSize: 50,
        totalItems: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      })
    })

    it('should handle custom pagination', async () => {
      prismaMock.account.count.mockResolvedValue(100)
      prismaMock.account.findMany.mockResolvedValue([])

      const result = await getAccounts(userId, { page: 2, limit: 20 })

      expect(prismaMock.account.findMany).toHaveBeenCalledWith({
        where: { userId, isArchived: false },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        skip: 20, // (2-1) * 20
        take: 20,
      })

      expect((result.pagination as any).currentPage).toBe(2)
      expect((result.pagination as any).pageSize).toBe(20)
      expect((result.pagination as any).totalPages).toBe(5)
    })

    it('should run count and findMany in parallel', async () => {
      prismaMock.account.count.mockResolvedValue(2)
      prismaMock.account.findMany.mockResolvedValue([])

      await getAccounts(userId)

      // Both should be called
      expect(prismaMock.account.count).toHaveBeenCalled()
      expect(prismaMock.account.findMany).toHaveBeenCalled()
    })
  })

  describe('getAccountById', () => {
    it('should get account by id', async () => {
      const account = mockAccount({ id: 'acc-123', userId })

      prismaMock.account.findFirst.mockResolvedValue(account)

      const result = await getAccountById(userId, 'acc-123')

      expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
        where: { id: 'acc-123', userId },
      })
      expect(result).toEqual(account)
    })

    it('should throw error when account not found', async () => {
      prismaMock.account.findFirst.mockResolvedValue(null)

      await expect(getAccountById(userId, 'non-existent')).rejects.toThrow(AppError)
      await expect(getAccountById(userId, 'non-existent')).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.ACCOUNT_NOT_FOUND,
          statusCode: 404,
        })
      )
    })
  })

  describe('updateAccount', () => {
    const accountId = 'acc-123'
    const existingAccount = mockAccount({ id: accountId, userId, isDefault: false })

    it('should update account fields', async () => {
      const updateData = {
        name: 'Updated Account Name',
        balance: 2000,
      }

      prismaMock.account.findFirst.mockResolvedValue(existingAccount)
      prismaMock.account.update.mockResolvedValue({
        ...existingAccount,
        ...updateData,
      })

      const result = await updateAccount(userId, accountId, updateData)

      expect(prismaMock.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: updateData,
      })
      expect(result.name).toBe(updateData.name)
      expect(result.balance).toBe(updateData.balance)
    })

    it('should unset other defaults when setting isDefault to true', async () => {
      const updateData = { isDefault: true }

      prismaMock.account.findFirst.mockResolvedValue(existingAccount)
      prismaMock.account.updateMany.mockResolvedValue({ count: 1 })
      prismaMock.account.update.mockResolvedValue({
        ...existingAccount,
        isDefault: true,
      })

      await updateAccount(userId, accountId, updateData)

      expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          isDefault: true,
          NOT: { id: accountId },
        },
        data: { isDefault: false },
      })
    })

    it('should throw error when account not found', async () => {
      prismaMock.account.findFirst.mockResolvedValue(null)

      await expect(updateAccount(userId, 'non-existent', {})).rejects.toThrow(AppError)
    })

    it('should generate color if account has no color and none provided', async () => {
      const accountWithoutColor = mockAccount({ id: accountId, userId, color: null })
      prismaMock.account.findFirst.mockResolvedValue(accountWithoutColor)
      prismaMock.account.update.mockResolvedValue({
        ...accountWithoutColor,
        color: '#3B82F6',
      })

      await updateAccount(userId, accountId, { name: 'New Name' })

      const updateCall = prismaMock.account.update.mock.calls[0][0]
      expect(updateCall.data).toHaveProperty('color')
      expect(updateCall.data.color).toMatch(/^#[0-9A-F]{6}$/i)
    })
  })

  describe('deleteAccount', () => {
    const accountId = 'acc-123'

    it('should delete account with no transactions', async () => {
      const account = mockAccount({ id: accountId, userId })

      prismaMock.account.findFirst.mockResolvedValue(account as any)
      prismaMock.transaction.count.mockResolvedValue(0)
      prismaMock.account.delete.mockResolvedValue(account as any)

      const result = await deleteAccount(userId, accountId)

      expect(prismaMock.transaction.count).toHaveBeenCalledWith({
        where: { accountId },
      })
      expect(result).toHaveProperty('hasTransactions', false)
    })

    it('should return info when account has transactions', async () => {
      const account = mockAccount({ id: accountId, userId })

      prismaMock.account.findFirst.mockResolvedValue(account as any)
      prismaMock.transaction.count.mockResolvedValue(5)

      const result = await deleteAccount(userId, accountId)

      expect(result).toHaveProperty('hasTransactions', true)
      expect(result).toHaveProperty('transactionCount', 5)
    })

    it('should throw error when account not found', async () => {
      prismaMock.account.findFirst.mockResolvedValue(null)

      await expect(deleteAccount(userId, 'non-existent')).rejects.toThrow(AppError)
    })
  })

  describe('getTotalBalance', () => {
    it('should calculate total balance across all accounts', async () => {
      const accounts = [
        mockAccount({ balance: 1000, type: 'CASH' }),
        mockAccount({ balance: 500, type: 'SAVINGS' }),
        mockAccount({ balance: -200, type: 'CREDIT' }), // Credit card debt
      ]

      prismaMock.account.findMany.mockResolvedValue(accounts)

      const result = await getTotalBalance(userId)

      expect(prismaMock.account.findMany).toHaveBeenCalledWith({
        where: { userId, isArchived: false },
        select: { balance: true, type: true },
      })

      expect(result).toEqual({
        totalBalance: 1300, // 1000 + 500 - 200
        cashBalance: 1000,
        savingsBalance: 500,
        creditBalance: -200,
      })
    })

    it('should handle accounts with zero balances', async () => {
      const accounts = [mockAccount({ balance: 0, type: 'CASH' })]

      prismaMock.account.findMany.mockResolvedValue(accounts)

      const result = await getTotalBalance(userId)

      expect(result.totalBalance).toBe(0)
    })

    it('should exclude archived accounts', async () => {
      prismaMock.account.findMany.mockResolvedValue([])

      await getTotalBalance(userId)

      expect(prismaMock.account.findMany).toHaveBeenCalledWith({
        where: { userId, isArchived: false },
        select: { balance: true, type: true },
      })
    })
  })
})
