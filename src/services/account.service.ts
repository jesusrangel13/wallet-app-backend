import { PrismaClient, AccountType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { PaginationParams, calculatePagination, calculateSkip, PaginatedResponse } from '../@types/pagination.types';

const prisma = new PrismaClient();

// Generate random hex color from predefined palette
const generateRandomColor = (): string => {
  const colors = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1',
    '#8B5CF6', '#EC4899', '#F43F5E', '#14B8A6', '#06B6D4',
    '#84CC16', '#EAB308', '#F97316', '#D946EF', '#0EA5E9'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
};

interface CreateAccountData {
  name: string;
  type: AccountType;
  balance?: number;
  currency?: string;
  isDefault?: boolean;
  accountNumber?: string;
  color?: string;
  creditLimit?: number;
  billingDay?: number;
}

interface UpdateAccountData {
  name?: string;
  type?: AccountType;
  balance?: number;
  currency?: string;
  isDefault?: boolean;
  accountNumber?: string;
  color?: string;
  creditLimit?: number;
  billingDay?: number;
}

export const createAccount = async (userId: string, data: CreateAccountData) => {
  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await prisma.account.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  // Generate random color if not provided
  const accountColor = data.color || generateRandomColor();

  const account = await prisma.account.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      balance: data.balance || 0,
      currency: data.currency || 'USD',
      isDefault: data.isDefault || false,
      accountNumber: data.accountNumber,
      color: accountColor,
      creditLimit: data.creditLimit,
      billingDay: data.billingDay,
    },
  });

  return account;
};

export const getAccounts = async (
  userId: string,
  pagination?: PaginationParams
): Promise<PaginatedResponse<any>> => {
  // Pagination parameters with defaults
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 50, 200); // Default 50, max 200
  const skip = calculateSkip(page, limit);

  // Get total count for pagination metadata
  const total = await prisma.account.count({ where: { userId } });

  // Get paginated accounts
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    skip,
    take: limit,
  });

  return {
    data: accounts,
    pagination: calculatePagination(page, limit, total),
  };
};

export const getAccountById = async (userId: string, accountId: string) => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  return account;
};

export const updateAccount = async (
  userId: string,
  accountId: string,
  data: UpdateAccountData
) => {
  // Check if account exists and belongs to user
  const existingAccount = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });

  if (!existingAccount) {
    throw new AppError('Account not found', 404);
  }

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await prisma.account.updateMany({
      where: { userId, isDefault: true, NOT: { id: accountId } },
      data: { isDefault: false },
    });
  }

  // Generate color if account doesn't have one and none provided
  const updateData = { ...data };
  if (!existingAccount.color && !data.color) {
    updateData.color = generateRandomColor();
  }

  const account = await prisma.account.update({
    where: { id: accountId },
    data: updateData,
  });

  return account;
};

export const deleteAccount = async (
  userId: string,
  accountId: string,
  transferToAccountId?: string
) => {
  // Check if account exists and belongs to user
  const existingAccount = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });

  if (!existingAccount) {
    throw new AppError('Account not found', 404);
  }

  // Check if account has transactions
  const transactionCount = await prisma.transaction.count({
    where: { accountId },
  });

  if (transactionCount > 0) {
    if (!transferToAccountId) {
      // Return info about transactions so frontend can decide
      return {
        hasTransactions: true,
        transactionCount,
        message: 'Account has transactions. Please specify a target account to transfer them or confirm deletion.',
      };
    }

    // Validate target account exists and belongs to user
    const targetAccount = await prisma.account.findFirst({
      where: { id: transferToAccountId, userId },
    });

    if (!targetAccount) {
      throw new AppError('Target account not found', 404);
    }

    if (transferToAccountId === accountId) {
      throw new AppError('Cannot transfer transactions to the same account', 400);
    }

    // Transfer all transactions to the target account
    await prisma.transaction.updateMany({
      where: { accountId },
      data: { accountId: transferToAccountId },
    });

    // Also update transfer destination transactions (where this account is the destination)
    await prisma.transaction.updateMany({
      where: { toAccountId: accountId },
      data: { toAccountId: transferToAccountId },
    });
  }

  // Delete the account
  await prisma.account.delete({
    where: { id: accountId },
  });

  return {
    hasTransactions: false,
    transactionCount,
    transferred: transactionCount > 0,
    message: `Account deleted successfully${transactionCount > 0 ? `. ${transactionCount} transaction(s) transferred.` : '.'}`,
  };
};

export const getAccountBalance = async (userId: string, accountId: string) => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, name: true, balance: true, currency: true },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  return account;
};

export const getTotalBalance = async (userId: string) => {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      includeInTotalBalance: true,
      isArchived: false,
    },
    select: { balance: true, currency: true },
  });

  // Group by currency
  const balanceByCurrency = accounts.reduce((acc, account) => {
    if (!acc[account.currency]) {
      acc[account.currency] = 0;
    }
    acc[account.currency] += Number(account.balance);
    return acc;
  }, {} as Record<string, number>);

  return balanceByCurrency;
};

export const getAccountBalanceHistory = async (
  userId: string,
  accountId: string,
  month?: number,
  year?: number
) => {
  // Verify account exists and belongs to user
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  // Use current month/year if not provided
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth() + 1; // 1-12
  const targetYear = year !== undefined ? year : now.getFullYear();

  // Calculate date range for the month
  const startDate = new Date(targetYear, targetMonth - 1, 1); // Month is 0-indexed
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59); // Last day of month
  const daysInMonth = endDate.getDate();

  // Get transactions for this account in the date range
  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { accountId, date: { gte: startDate, lte: endDate } },
        { toAccountId: accountId, date: { gte: startDate, lte: endDate } },
      ],
    },
    select: {
      date: true,
      type: true,
      amount: true,
      accountId: true,
      toAccountId: true,
    },
    orderBy: { date: 'asc' },
  });

  // Calculate initial balance (transactions before start date)
  const initialBalanceData = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      OR: [
        { accountId, date: { lt: startDate } },
        { toAccountId: accountId, type: 'TRANSFER', date: { lt: startDate } },
      ],
    },
    _sum: { amount: true },
  });

  // Also need to account for transfers separately
  const initialTransferIn = await prisma.transaction.aggregate({
    where: {
      toAccountId: accountId,
      type: 'TRANSFER',
      date: { lt: startDate },
    },
    _sum: { amount: true },
  });

  const initialTransferOut = await prisma.transaction.aggregate({
    where: {
      accountId,
      type: 'TRANSFER',
      date: { lt: startDate },
    },
    _sum: { amount: true },
  });

  let initialBalance = Number(account.balance); // Start with current balance

  // Calculate what to subtract from current balance to get initial balance
  let futureChanges = 0;

  // Sum all transactions from start date to now
  const futureTransactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { accountId, date: { gte: startDate } },
        { toAccountId: accountId, date: { gte: startDate } },
      ],
    },
    select: {
      type: true,
      amount: true,
      accountId: true,
      toAccountId: true,
    },
  });

  const isCreditCard = account.type === 'CREDIT';

  futureTransactions.forEach((tx) => {
    const amount = Number(tx.amount);

    if (isCreditCard) {
      // For credit cards: balance = available credit (limit - spent)
      // EXPENSE reduces available credit (subtract from balance)
      // INCOME/PAYMENT increases available credit (add to balance)
      if (tx.type === 'INCOME' && tx.accountId === accountId) {
        futureChanges += amount; // Payment increases available credit
      } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
        futureChanges -= amount; // Spending reduces available credit
      } else if (tx.type === 'TRANSFER') {
        if (tx.accountId === accountId) {
          futureChanges -= amount; // Money out reduces available credit
        }
        if (tx.toAccountId === accountId) {
          futureChanges += amount; // Money in increases available credit
        }
      }
    } else {
      // For normal accounts: standard balance calculation
      if (tx.type === 'INCOME' && tx.accountId === accountId) {
        futureChanges += amount;
      } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
        futureChanges -= amount;
      } else if (tx.type === 'TRANSFER') {
        if (tx.accountId === accountId) {
          futureChanges -= amount; // Money out
        }
        if (tx.toAccountId === accountId) {
          futureChanges += amount; // Money in
        }
      }
    }
  });

  initialBalance = initialBalance - futureChanges;

  // Calculate daily balances
  const dailyBalances: Array<{ date: string; balance: number }> = [];
  let currentBalance = initialBalance;

  // Group transactions by day
  const transactionsByDay: Record<string, typeof transactions> = {};
  transactions.forEach((tx) => {
    const dayKey = tx.date.toISOString().slice(0, 10);
    if (!transactionsByDay[dayKey]) {
      transactionsByDay[dayKey] = [];
    }
    transactionsByDay[dayKey].push(tx);
  });

  // Generate data for each day in the month
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(targetYear, targetMonth - 1, day);
    const dayKey = currentDate.toISOString().slice(0, 10);

    // Apply transactions for this day
    if (transactionsByDay[dayKey]) {
      transactionsByDay[dayKey].forEach((tx) => {
        const amount = Number(tx.amount);

        if (isCreditCard) {
          // For credit cards: balance = available credit
          if (tx.type === 'INCOME' && tx.accountId === accountId) {
            currentBalance += amount; // Payment increases available credit
          } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
            currentBalance -= amount; // Spending reduces available credit
          } else if (tx.type === 'TRANSFER') {
            if (tx.accountId === accountId) {
              currentBalance -= amount; // Money leaving reduces available credit
            }
            if (tx.toAccountId === accountId) {
              currentBalance += amount; // Money coming in increases available credit
            }
          }
        } else {
          // For normal accounts: standard balance calculation
          if (tx.type === 'INCOME' && tx.accountId === accountId) {
            currentBalance += amount;
          } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
            currentBalance -= amount;
          } else if (tx.type === 'TRANSFER') {
            if (tx.accountId === accountId) {
              currentBalance -= amount; // Money leaving this account
            }
            if (tx.toAccountId === accountId) {
              currentBalance += amount; // Money coming into this account
            }
          }
        }
      });
    }

    dailyBalances.push({
      date: dayKey,
      balance: Math.round(currentBalance * 100) / 100, // Round to 2 decimals
    });
  }

  // Calculate previous month balance for comparison
  const previousMonth = targetMonth === 1 ? 12 : targetMonth - 1;
  const previousYear = targetMonth === 1 ? targetYear - 1 : targetYear;
  const previousMonthEnd = new Date(previousYear, previousMonth, 0); // Last day of previous month

  const previousBalanceTransactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { accountId, date: { lte: previousMonthEnd } },
        { toAccountId: accountId, date: { lte: previousMonthEnd } },
      ],
    },
    select: {
      type: true,
      amount: true,
      accountId: true,
      toAccountId: true,
    },
  });

  let previousMonthBalance = initialBalance; // Start from initial balance of current month

  // Go back and calculate previous month end balance
  previousBalanceTransactions.forEach((tx) => {
    const amount = Number(tx.amount);
    if (tx.type === 'INCOME' && tx.accountId === accountId) {
      previousMonthBalance += amount;
    } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
      previousMonthBalance -= amount;
    } else if (tx.type === 'TRANSFER') {
      if (tx.accountId === accountId) {
        previousMonthBalance -= amount;
      }
      if (tx.toAccountId === accountId) {
        previousMonthBalance += amount;
      }
    }
  });

  // Actually, let's recalculate this more simply
  // Previous month balance = initial balance (which is balance at start of current month)
  previousMonthBalance = initialBalance;

  const currentMonthEndBalance = dailyBalances[dailyBalances.length - 1]?.balance || initialBalance;
  const percentageChange = previousMonthBalance !== 0
    ? ((currentMonthEndBalance - previousMonthBalance) / Math.abs(previousMonthBalance)) * 100
    : 0;

  return {
    history: dailyBalances,
    currentBalance: Number(account.balance),
    previousMonthBalance: Math.round(previousMonthBalance * 100) / 100,
    percentageChange: Math.round(percentageChange * 100) / 100,
    month: targetMonth,
    year: targetYear,
  };
};
