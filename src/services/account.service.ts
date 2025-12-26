import { PrismaClient, AccountType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
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

  const where = {
    userId,
    isArchived: false
  };

  // OPTIMIZATION: Run count and findMany in parallel
  const [total, accounts] = await Promise.all([
    prisma.account.count({ where }),
    prisma.account.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    })
  ]);

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
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
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
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
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
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
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
      throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
    }

    if (transferToAccountId === accountId) {
      throw new AppError(ErrorCodes.TRANSACTION_SAME_ACCOUNT_TRANSFER, 400);
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
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
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
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  // Use current month/year if not provided
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth() + 1; // 1-12
  const targetYear = year !== undefined ? year : now.getFullYear();

  // Calculate date range for the month
  const startDate = new Date(targetYear, targetMonth - 1, 1); // Month is 0-indexed
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59); // Last day of month
  const daysInMonth = endDate.getDate();

  // Optimized approach: Start from current balance (`account.balance`) and calculate backwards
  // logic requires fetching all transactions from startDate to NOW (descending)

  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { accountId, date: { gte: startDate } },
        { toAccountId: accountId, date: { gte: startDate } },
      ],
    },
    select: {
      date: true,
      type: true,
      amount: true,
      accountId: true,
      toAccountId: true,
    },
    orderBy: { date: 'desc' }, // Descending for backward calculation
  });

  // Start with current balance
  // Note: account.balance is Decimal, convert to Number
  let runningBalance = Number(account.balance);
  const isCreditCard = account.type === 'CREDIT';

  // We need to calculate daily balances for the target month [1..daysInMonth]
  // The transactions array includes transactions from NOW down to startDate

  // Strategy:
  // 1. Walk backward from NOW to endDate of target month (unwind future transactions)
  // 2. Walk backward from endDate to startDate (record daily balances)

  const dailyBalances: Array<{ date: string; balance: number }> = [];

  // Helper to reverse effect of a transaction
  const reverseTransaction = (tx: any, currentBal: number): number => {
    const amount = Number(tx.amount);
    let newBal = currentBal;

    if (isCreditCard) {
      // Credit Card: Balance = Available Credit
      // INCOME (Payment) increases available -> Reverse: Subtract
      // EXPENSE decreases available -> Reverse: Add
      // TRANSFER OUT (like expense) -> Reverse: Add
      // TRANSFER IN (like payment) -> Reverse: Subtract

      if (tx.type === 'INCOME' && tx.accountId === accountId) {
        newBal -= amount;
      } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
        newBal += amount;
      } else if (tx.type === 'TRANSFER') {
        if (tx.accountId === accountId) {
          newBal += amount; // Was subtracted, so add back
        }
        if (tx.toAccountId === accountId) {
          newBal -= amount; // Was added, so subtract
        }
      }
    } else {
      // Normal Account: Balance = Asset
      // INCOME increases -> Reverse: Subtract
      // EXPENSE decreases -> Reverse: Add
      // TRANSFER OUT decreases -> Reverse: Add
      // TRANSFER IN increases -> Reverse: Subtract

      if (tx.type === 'INCOME' && tx.accountId === accountId) {
        newBal -= amount;
      } else if (tx.type === 'EXPENSE' && tx.accountId === accountId) {
        newBal += amount;
      } else if (tx.type === 'TRANSFER') {
        if (tx.accountId === accountId) {
          newBal += amount;
        }
        if (tx.toAccountId === accountId) {
          newBal -= amount;
        }
      }
    }
    return newBal;
  };

  // Map transactions by day string YYYY-MM-DD
  const transactionsByDay: Record<string, typeof transactions> = {};
  transactions.forEach((tx) => {
    const dayKey = tx.date.toISOString().slice(0, 10);
    if (!transactionsByDay[dayKey]) transactionsByDay[dayKey] = [];
    transactionsByDay[dayKey].push(tx);
  });

  // Loop backwards day by day from NOW back to startDate
  const processDate = new Date();
  processDate.setHours(23, 59, 59, 999);

  // Safe limit
  const processStartDate = new Date(startDate);

  // Determine range strings for comparison
  const endDateStr = endDate.toISOString().slice(0, 10);
  const startDateStr = startDate.toISOString().slice(0, 10);

  // If we are currently in a future month relative to target, or current date > endDate
  // we just walk back until we hit endDate.

  // If target month is current month, endDate is end of month (future), so loop starts from today.

  while (processDate >= startDate) {
    const dayKey = processDate.toISOString().slice(0, 10);

    // If this day is within our target month, record the balance (which is end-of-day balance)
    if (dayKey <= endDateStr && dayKey >= startDateStr) {
      dailyBalances.push({
        date: dayKey,
        balance: Math.round(runningBalance * 100) / 100, // Round to 2 decimals
      });
    }

    // Unwind transactions of this day to get start-of-day balance (which is end-of-prev-day balance)
    if (transactionsByDay[dayKey]) {
      // Process in reverse order? Transaction.findMany is 'desc' by date.
      // So index 0 is latest time.
      // If we are moving backwards in time, we process latest transactions first.
      // Yes, correct.
      transactionsByDay[dayKey].forEach((tx) => {
        runningBalance = reverseTransaction(tx, runningBalance);
      });
    }

    // Move to previous day
    processDate.setDate(processDate.getDate() - 1);
  }

  // Ensure we have data points for every day in the month even if 'now' is mid-month?
  // If target month is a PAST month, 'processDate' starts at 'now' and goes back through everything. 
  // It handles it correctly.

  // However, if the target month is FUTURE (not allowed usually) or partially future (current month), 
  // we only have data up to today.
  // The loop `while (processDate >= startDate)` handles up to today. 
  // The days AFTER today in the current month are not processed because `processDate` starts at today.
  // So we won't push entries for future days, which is correct (graph stops at today).

  // BUT if target month is PAST, loop will cover all days.

  // Problem: If target month is PAST, `processDate` starts at today. 
  // It unrolls all days from today down to `endDate`. 
  // When it hits `endDate`, it starts pushing to `dailyBalances`.

  // The array `dailyBalances` is in DESC order (latest date first).
  dailyBalances.reverse();

  // Calculate previous month balance (which is the balance at start of 1st day of this month)
  // After the loop finishes (processDate < startDate), `runningBalance` holds the balance at End of (startDate - 1 day).
  // i.e., Start of startDate.
  const previousMonthBalance = runningBalance;

  const currentMonthEndBalance = dailyBalances[dailyBalances.length - 1]?.balance || previousMonthBalance;

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
