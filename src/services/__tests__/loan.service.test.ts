/**
 * Tests for LoanService
 * Tests loan creation, payment recording, and status management
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { mockDeep } from 'jest-mock-extended'

// Create mocks BEFORE any imports
const prismaMock = mockDeep<PrismaClient>()
const categoryResolverMock = {
  resolveCategoryById: jest.fn<() => Promise<string | null>>(),
  searchCategoriesByName: jest.fn<() => Promise<string[]>>(),
}

// Mock modules BEFORE importing the service
jest.mock('../../utils/prisma', () => ({
  prisma: prismaMock,
}))
jest.mock('../categoryResolver.service', () => categoryResolverMock)

// NOW import the service and other dependencies
import {
  createLoan,
  getUserLoans,
  getLoanById,
  recordLoanPayment,
  cancelLoan,
  deleteLoan,
} from '../loan.service'
import { mockUser, mockAccount, mockLoan, mockTransaction } from '../../__tests__/mocks/prisma'
import { AppError } from '../../middleware/errorHandler'
import { ErrorCodes } from '../../constants/errorCodes'

describe('LoanService', () => {
  const userId = 'user-123'
  const accountId = 'account-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createLoan', () => {
    const user = mockUser({ id: userId })
    const account = mockAccount({ id: accountId, userId, balance: 1000 })

    const loanData = {
      borrowerName: 'John Doe',
      amount: 500,
      accountId,
      notes: 'Short term loan',
    }

    it('should create a loan and associated expense transaction', async () => {
      const createdLoan = mockLoan({
        userId,
        borrowerName: loanData.borrowerName,
        originalAmount: loanData.amount,
        paidAmount: 0,
        status: 'ACTIVE',
      })

      const loanTransaction = mockTransaction({
        userId,
        accountId,
        type: 'EXPENSE',
        amount: loanData.amount,
        description: `Préstamo a ${loanData.borrowerName}`,
      })

      // Mock validations
      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.searchCategoriesByName.mockResolvedValue(['cat-loan'])

      // Mock transaction context
      const mockTx = {
        loan: { create: jest.fn().mockResolvedValue(createdLoan) },
        transaction: { create: jest.fn().mockResolvedValue(loanTransaction) },
        account: { update: jest.fn().mockResolvedValue({ ...account, balance: 500 }) },
      }

      prismaMock.$transaction.mockImplementation(async (callback: any) => {
        return callback(mockTx)
      })

      const result = await createLoan(userId, loanData)

      // Verify user and account validation
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { name: true, currency: true },
      })
      expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
        where: { id: accountId, userId },
      })

      // Verify loan creation
      expect(mockTx.loan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          borrowerName: loanData.borrowerName,
          originalAmount: loanData.amount,
          paidAmount: 0,
          status: 'ACTIVE',
        }),
        include: expect.any(Object),
      })

      // Verify transaction creation
      expect(mockTx.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          accountId,
          type: 'EXPENSE',
          amount: loanData.amount,
          payee: loanData.borrowerName,
        }),
        include: expect.any(Object),
      })

      // Verify account balance update
      expect(mockTx.account.update).toHaveBeenCalled()
    })

    it('should throw error when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)

      await expect(createLoan(userId, loanData)).rejects.toThrow(AppError)
      await expect(createLoan(userId, loanData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_USER_NOT_FOUND,
          statusCode: 404,
        })
      )
    })

    it('should throw error when account not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user)
      prismaMock.account.findFirst.mockResolvedValue(null)

      await expect(createLoan(userId, loanData)).rejects.toThrow(AppError)
      await expect(createLoan(userId, loanData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.ACCOUNT_NOT_FOUND,
        })
      )
    })

    it('should validate borrowerUserId if provided', async () => {
      const borrower = mockUser({ id: 'borrower-123' })
      const loanDataWithBorrower = {
        ...loanData,
        borrowerUserId: borrower.id,
      }

      prismaMock.user.findUnique
        .mockResolvedValueOnce(user) // Lender
        .mockResolvedValueOnce(borrower) // Borrower
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.searchCategoriesByName.mockResolvedValue([])

      const mockTx = {
        loan: { create: jest.fn().mockResolvedValue(mockLoan()) },
        transaction: { create: jest.fn().mockResolvedValue(mockTransaction()) },
        account: { update: jest.fn().mockResolvedValue(account) },
      }
      prismaMock.$transaction.mockImplementation(async (callback: any) => callback(mockTx))

      await createLoan(userId, loanDataWithBorrower)

      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(2)
      expect(prismaMock.user.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: borrower.id },
      })
    })
  })

  describe('getUserLoans', () => {
    it('should get all user loans with pagination', async () => {
      const loans = [
        mockLoan({ id: 'loan-1', userId }),
        mockLoan({ id: 'loan-2', userId }),
      ]

      prismaMock.loan.count.mockResolvedValue(2)
      prismaMock.loan.findMany.mockResolvedValue(loans)

      const result = await getUserLoans(userId)

      expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
        where: { userId },
        include: expect.any(Object),
        orderBy: { loanDate: 'desc' },
        skip: 0,
        take: 50, // Default limit
      })

      expect(result.data).toEqual(loans)
      expect(result.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1,
        hasMore: false,
      })
    })

    it('should filter loans by status', async () => {
      prismaMock.loan.count.mockResolvedValue(0)
      prismaMock.loan.findMany.mockResolvedValue([])

      await getUserLoans(userId, { status: 'PAID' })

      expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          status: 'PAID',
        },
        include: expect.any(Object),
        orderBy: { loanDate: 'desc' },
        skip: 0,
        take: 50,
      })
    })

    it('should filter loans by borrower name', async () => {
      prismaMock.loan.count.mockResolvedValue(0)
      prismaMock.loan.findMany.mockResolvedValue([])

      await getUserLoans(userId, { borrowerName: 'John' })

      expect(prismaMock.loan.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          borrowerName: {
            contains: 'John',
            mode: 'insensitive',
          },
        },
        include: expect.any(Object),
        orderBy: { loanDate: 'desc' },
        skip: 0,
        take: 50,
      })
    })
  })

  describe('getLoanById', () => {
    it('should get loan by id', async () => {
      const loan = mockLoan({ id: 'loan-123', userId })

      prismaMock.loan.findFirst.mockResolvedValue(loan)

      const result = await getLoanById(userId, 'loan-123')

      expect(prismaMock.loan.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'loan-123',
          userId,
        },
        include: expect.any(Object),
      })
      expect(result).toEqual(loan)
    })

    it('should throw error when loan not found', async () => {
      prismaMock.loan.findFirst.mockResolvedValue(null)

      await expect(getLoanById(userId, 'non-existent')).rejects.toThrow(AppError)
      await expect(getLoanById(userId, 'non-existent')).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.LOAN_NOT_FOUND,
        })
      )
    })
  })

  describe('recordLoanPayment', () => {
    it('should record partial payment', async () => {
      const loan = mockLoan({
        id: 'loan-123',
        userId,
        originalAmount: 500,
        paidAmount: 0,
        status: 'ACTIVE',
      })

      const paymentData = {
        amount: 200,
        accountId: 'account-123',
        notes: 'First payment',
      }

      const account = mockAccount({ id: paymentData.accountId, userId })

      prismaMock.loan.findFirst.mockResolvedValue(loan)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.searchCategoriesByName.mockResolvedValue([])

      const mockTx = {
        loanPayment: { create: jest.fn().mockResolvedValue({ id: 'payment-123' }) },
        transaction: { create: jest.fn().mockResolvedValue(mockTransaction()) },
        loan: { update: jest.fn().mockResolvedValue({ ...loan, paidAmount: 200 }) },
        account: { update: jest.fn().mockResolvedValue(account) },
      }
      prismaMock.$transaction.mockImplementation(async (callback: any) => callback(mockTx))

      await recordLoanPayment(userId, 'loan-123', paymentData)

      // Verify loan is updated with payment
      expect(mockTx.loan.update).toHaveBeenCalledWith({
        where: { id: 'loan-123' },
        data: { paidAmount: 200 }, // 0 + 200
        include: expect.any(Object),
      })
    })

    it('should mark loan as PAID when fully paid', async () => {
      const loan = mockLoan({
        id: 'loan-123',
        userId,
        originalAmount: 500,
        paidAmount: 300,
        status: 'ACTIVE',
      })

      const paymentData = {
        amount: 200, // Total = 500, fully paid
        accountId: 'account-123',
      }

      const account = mockAccount({ id: paymentData.accountId, userId })

      prismaMock.loan.findFirst.mockResolvedValue(loan)
      prismaMock.account.findFirst.mockResolvedValue(account)
      categoryResolverMock.searchCategoriesByName.mockResolvedValue([])

      const mockTx = {
        loanPayment: { create: jest.fn().mockResolvedValue({ id: 'payment-123' }) },
        transaction: { create: jest.fn().mockResolvedValue(mockTransaction()) },
        loan: {
          update: jest.fn().mockResolvedValue({
            ...loan,
            paidAmount: 500,
            status: 'PAID',
          }),
        },
        account: { update: jest.fn().mockResolvedValue(account) },
      }
      prismaMock.$transaction.mockImplementation(async (callback: any) => callback(mockTx))

      await recordLoanPayment(userId, 'loan-123', paymentData)

      // Verify status changed to PAID
      expect(mockTx.loan.update).toHaveBeenCalledWith({
        where: { id: 'loan-123' },
        data: {
          paidAmount: 500,
          status: 'PAID',
        },
        include: expect.any(Object),
      })
    })

    it('should throw error when payment exceeds remaining amount', async () => {
      const loan = mockLoan({
        id: 'loan-123',
        userId,
        originalAmount: 500,
        paidAmount: 400,
        status: 'ACTIVE',
      })

      const paymentData = {
        amount: 200, // Would exceed loan amount
        accountId: 'account-123',
      }

      prismaMock.loan.findFirst.mockResolvedValue(loan)

      await expect(recordLoanPayment(userId, 'loan-123', paymentData)).rejects.toThrow(AppError)
    })
  })

  describe('cancelLoan', () => {
    it('should cancel an active loan', async () => {
      const loan = mockLoan({ id: 'loan-123', userId, status: 'ACTIVE' })

      prismaMock.loan.findFirst.mockResolvedValue(loan)
      prismaMock.loan.update.mockResolvedValue({ ...loan, status: 'CANCELLED' })

      const result = await cancelLoan(userId, 'loan-123')

      expect(prismaMock.loan.update).toHaveBeenCalledWith({
        where: { id: 'loan-123' },
        data: { status: 'CANCELLED' },
        include: expect.any(Object),
      })
      expect(result.status).toBe('CANCELLED')
    })

    it('should throw error when loan not found', async () => {
      prismaMock.loan.findFirst.mockResolvedValue(null)

      await expect(cancelLoan(userId, 'non-existent')).rejects.toThrow(AppError)
    })
  })

  describe('deleteLoan', () => {
    it('should delete loan without payments', async () => {
      const loan = mockLoan({ id: 'loan-123', userId, paidAmount: 0 })

      prismaMock.loan.findFirst.mockResolvedValue(loan)
      prismaMock.loanPayment.count.mockResolvedValue(0)
      prismaMock.loan.delete.mockResolvedValue(loan)

      await deleteLoan(userId, 'loan-123')

      expect(prismaMock.loan.delete).toHaveBeenCalledWith({
        where: { id: 'loan-123' },
      })
    })

    it('should throw error when loan has payments', async () => {
      const loan = mockLoan({ id: 'loan-123', userId, paidAmount: 100 })

      prismaMock.loan.findFirst.mockResolvedValue(loan)
      prismaMock.loanPayment.count.mockResolvedValue(2)

      await expect(deleteLoan(userId, 'loan-123')).rejects.toThrow(AppError)
      await expect(deleteLoan(userId, 'loan-123')).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.LOAN_HAS_PAYMENTS,
        })
      )

      expect(prismaMock.loan.delete).not.toHaveBeenCalled()
    })
  })
})
