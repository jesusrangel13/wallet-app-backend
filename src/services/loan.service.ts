import { PrismaClient, LoanStatus } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import * as transactionService from './transaction.service';
import { searchCategoriesByName } from './categoryResolver.service';

const prisma = new PrismaClient();

interface CreateLoanData {
  borrowerName: string;
  borrowerUserId?: string;
  amount: number;
  accountId: string;
  loanDate?: string;
  notes?: string;
}

interface RecordPaymentData {
  amount: number;
  accountId: string;
  paymentDate?: string;
  notes?: string;
}

interface LoanFilters {
  status?: LoanStatus;
  borrowerName?: string;
}

/**
 * Create a new loan
 * This creates both the loan record AND an EXPENSE transaction in the user's account
 */
export const createLoan = async (userId: string, data: CreateLoanData) => {
  // Validate user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, currency: true },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Validate account exists and belongs to user
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  });

  if (!account) {
    throw new AppError('Account not found or does not belong to user', 404);
  }

  // If borrowerUserId is provided, validate it exists
  if (data.borrowerUserId) {
    const borrower = await prisma.user.findUnique({
      where: { id: data.borrowerUserId },
    });

    if (!borrower) {
      throw new AppError('Borrower user not found', 404);
    }
  }

  // Find "Préstamo otorgado" category
  const loanCategory = await searchCategoriesByName('Préstamo otorgado', userId);
  const categoryId = loanCategory.length > 0 ? loanCategory[0] : undefined;

  // Use database transaction to ensure atomicity
  return await prisma.$transaction(async (tx) => {
    // 1. Create the loan record
    const loan = await tx.loan.create({
      data: {
        userId,
        borrowerName: data.borrowerName,
        borrowerUserId: data.borrowerUserId,
        originalAmount: data.amount,
        paidAmount: 0,
        currency: account.currency,
        loanDate: data.loanDate ? new Date(data.loanDate) : new Date(),
        notes: data.notes,
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
        borrowerUser: {
          select: { name: true, email: true },
        },
        payments: true,
      },
    });

    // 2. Create EXPENSE transaction (money leaving account)
    const transaction = await transactionService.createTransaction(userId, {
      accountId: data.accountId,
      type: 'EXPENSE',
      amount: data.amount,
      categoryId,
      description: `Préstamo a ${data.borrowerName}`,
      date: data.loanDate,
      payee: data.borrowerName,
    });

    // 3. Link transaction to loan
    await tx.transaction.update({
      where: { id: transaction.id },
      data: { loanId: loan.id },
    });

    // Return loan with transaction
    return {
      ...loan,
      loanTransaction: transaction,
    };
  });
};

/**
 * Get all loans for a user with optional filters
 */
export const getUserLoans = async (userId: string, filters?: LoanFilters) => {
  const where: any = { userId };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.borrowerName) {
    where.borrowerName = {
      contains: filters.borrowerName,
      mode: 'insensitive',
    };
  }

  const loans = await prisma.loan.findMany({
    where,
    include: {
      user: {
        select: { name: true, email: true },
      },
      borrowerUser: {
        select: { name: true, email: true },
      },
      loanTransaction: {
        include: {
          account: {
            select: { name: true, currency: true },
          },
        },
      },
      payments: {
        include: {
          transaction: {
            include: {
              account: {
                select: { name: true, currency: true },
              },
            },
          },
        },
        orderBy: {
          paymentDate: 'desc',
        },
      },
    },
    orderBy: {
      loanDate: 'desc',
    },
  });

  return loans;
};

/**
 * Get a single loan by ID
 */
export const getLoanById = async (userId: string, loanId: string) => {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: {
      user: {
        select: { name: true, email: true },
      },
      borrowerUser: {
        select: { name: true, email: true },
      },
      loanTransaction: {
        include: {
          account: {
            select: { name: true, currency: true },
          },
        },
      },
      payments: {
        include: {
          transaction: {
            include: {
              account: {
                select: { name: true, currency: true },
              },
            },
          },
        },
        orderBy: {
          paymentDate: 'desc',
        },
      },
    },
  });

  if (!loan) {
    throw new AppError('Loan not found', 404);
  }

  return loan;
};

/**
 * Record a payment for a loan
 * This creates an INCOME transaction and updates the loan's paidAmount
 */
export const recordLoanPayment = async (
  userId: string,
  loanId: string,
  data: RecordPaymentData
) => {
  // Get loan and validate ownership
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: {
      borrowerUser: {
        select: { name: true },
      },
    },
  });

  if (!loan) {
    throw new AppError('Loan not found', 404);
  }

  // Calculate pending amount
  const pendingAmount = Number(loan.originalAmount) - Number(loan.paidAmount);

  // Validate payment amount
  if (data.amount <= 0) {
    throw new AppError('Payment amount must be positive', 400);
  }

  if (data.amount > pendingAmount) {
    throw new AppError(`Payment amount cannot exceed pending amount of ${pendingAmount}`, 400);
  }

  // Validate account exists and belongs to user
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  });

  if (!account) {
    throw new AppError('Account not found or does not belong to user', 404);
  }

  // Find "Cobro de préstamo" category
  const loanPaymentCategory = await searchCategoriesByName('Cobro de préstamo', userId);
  const categoryId = loanPaymentCategory.length > 0 ? loanPaymentCategory[0] : undefined;

  // Use database transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Create INCOME transaction (money coming into account)
    const transaction = await transactionService.createTransaction(userId, {
      accountId: data.accountId,
      type: 'INCOME',
      amount: data.amount,
      categoryId,
      description: `Pago de préstamo de ${loan.borrowerName}`,
      date: data.paymentDate,
      payer: loan.borrowerName,
    });

    // 2. Create loan payment record
    const payment = await tx.loanPayment.create({
      data: {
        loanId,
        amount: data.amount,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
        transactionId: transaction.id,
        notes: data.notes,
      },
      include: {
        transaction: {
          include: {
            account: {
              select: { name: true, currency: true },
            },
          },
        },
      },
    });

    // 3. Update loan's paidAmount
    const newPaidAmount = Number(loan.paidAmount) + data.amount;
    const isFullyPaid = newPaidAmount >= Number(loan.originalAmount);

    await tx.loan.update({
      where: { id: loanId },
      data: {
        paidAmount: newPaidAmount,
        status: isFullyPaid ? 'PAID' : 'ACTIVE',
      },
    });

    return payment;
  });
};

/**
 * Cancel (forgive) a loan
 */
export const cancelLoan = async (userId: string, loanId: string) => {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
  });

  if (!loan) {
    throw new AppError('Loan not found', 404);
  }

  if (loan.status === 'CANCELLED') {
    throw new AppError('Loan is already cancelled', 400);
  }

  const updatedLoan = await prisma.loan.update({
    where: { id: loanId },
    data: { status: 'CANCELLED' },
    include: {
      user: {
        select: { name: true, email: true },
      },
      borrowerUser: {
        select: { name: true, email: true },
      },
      payments: true,
    },
  });

  return updatedLoan;
};

/**
 * Delete a loan (only if no payments have been made)
 */
export const deleteLoan = async (userId: string, loanId: string) => {
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: {
      payments: true,
      loanTransaction: true,
    },
  });

  if (!loan) {
    throw new AppError('Loan not found', 404);
  }

  if (loan.payments.length > 0) {
    throw new AppError('Cannot delete loan with payments. Cancel it instead.', 400);
  }

  // Use database transaction
  return await prisma.$transaction(async (tx) => {
    // 1. Delete the original transaction if it exists
    if (loan.loanTransaction) {
      await transactionService.deleteTransaction(userId, loan.loanTransaction.id);
    }

    // 2. Delete the loan (payments cascade delete automatically)
    await tx.loan.delete({
      where: { id: loanId },
    });

    return { message: 'Loan deleted successfully' };
  });
};

/**
 * Get loans summary for dashboard widget
 */
export const getLoansSummary = async (userId: string) => {
  const loans = await prisma.loan.findMany({
    where: { userId },
    select: {
      status: true,
      originalAmount: true,
      paidAmount: true,
      currency: true,
    },
  });

  const summary = {
    totalLoans: loans.length,
    activeLoans: loans.filter((l) => l.status === 'ACTIVE').length,
    totalLent: loans.reduce((sum, l) => sum + Number(l.originalAmount), 0),
    totalRecovered: loans.reduce((sum, l) => sum + Number(l.paidAmount), 0),
    totalPending: loans
      .filter((l) => l.status === 'ACTIVE')
      .reduce((sum, l) => sum + (Number(l.originalAmount) - Number(l.paidAmount)), 0),
    currency: loans[0]?.currency || 'CLP',
  };

  return summary;
};

/**
 * Get loans grouped by borrower
 */
export const getLoansByBorrower = async (userId: string) => {
  const loans = await prisma.loan.findMany({
    where: { userId },
    include: {
      borrowerUser: {
        select: { id: true, name: true, email: true },
      },
      payments: true,
    },
    orderBy: {
      borrowerName: 'asc',
    },
  });

  // Group by borrower
  const grouped = loans.reduce((acc, loan) => {
    const key = loan.borrowerUserId || loan.borrowerName;

    if (!acc[key]) {
      acc[key] = {
        borrowerName: loan.borrowerName,
        borrowerUserId: loan.borrowerUserId,
        borrowerUser: loan.borrowerUser,
        totalLoans: 0,
        totalLent: 0,
        totalPaid: 0,
        totalPending: 0,
        loans: [],
      };
    }

    acc[key].totalLoans += 1;
    acc[key].totalLent += Number(loan.originalAmount);
    acc[key].totalPaid += Number(loan.paidAmount);
    acc[key].totalPending +=
      loan.status === 'ACTIVE' ? Number(loan.originalAmount) - Number(loan.paidAmount) : 0;
    acc[key].loans.push(loan);

    return acc;
  }, {} as Record<string, any>);

  return Object.values(grouped);
};
