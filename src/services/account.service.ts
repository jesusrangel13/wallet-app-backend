import { PrismaClient, AccountType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

interface CreateAccountData {
  name: string;
  type: AccountType;
  balance?: number;
  currency?: string;
  isDefault?: boolean;
  creditLimit?: number;
  billingDay?: number;
}

interface UpdateAccountData {
  name?: string;
  type?: AccountType;
  balance?: number;
  currency?: string;
  isDefault?: boolean;
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

  const account = await prisma.account.create({
    data: {
      userId,
      name: data.name,
      type: data.type,
      balance: data.balance || 0,
      currency: data.currency || 'USD',
      isDefault: data.isDefault || false,
      creditLimit: data.creditLimit,
      billingDay: data.billingDay,
    },
  });

  return account;
};

export const getAccounts = async (userId: string) => {
  const accounts = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  return accounts;
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

  const account = await prisma.account.update({
    where: { id: accountId },
    data,
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
