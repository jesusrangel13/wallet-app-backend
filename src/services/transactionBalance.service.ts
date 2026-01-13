import { TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { prisma } from '../utils/prisma';

/**
 * Transaction Balance Service
 *
 * Extracted from transaction.service.ts as part of OPT-11 refactoring.
 * Handles all balance calculation and account update logic for transactions.
 *
 * Responsibilities:
 * - Calculate balance changes based on account type and transaction type
 * - Update account balances considering credit card special logic
 * - Handle transfer-specific balance updates
 */

interface BalanceUpdateOptions {
  accountId: string;
  accountType: string;
  transactionType: TransactionType;
  amount: number;
  operation: 'add' | 'subtract';
}

/**
 * Calculate the balance change for a transaction
 *
 * @param accountType - Type of account (CREDIT, CASH, DEBIT, SAVINGS, INVESTMENT)
 * @param transactionType - Type of transaction (INCOME, EXPENSE, TRANSFER)
 * @param amount - Transaction amount
 * @returns The balance change to apply
 */
export function calculateBalanceChange(
  accountType: string,
  transactionType: TransactionType,
  amount: number
): number {
  let balanceChange = amount;

  if (accountType === 'CREDIT') {
    // For credit cards, balance represents AVAILABLE credit
    if (transactionType === 'EXPENSE') {
      // Expenses reduce available credit
      balanceChange = -amount;
    } else if (transactionType === 'INCOME') {
      // Payments increase available credit
      balanceChange = amount;
    } else if (transactionType === 'TRANSFER') {
      // Transfers out reduce available credit
      balanceChange = -amount;
    }
  } else {
    // For other account types (CASH, DEBIT, SAVINGS, INVESTMENT)
    if (transactionType === 'EXPENSE' || transactionType === 'TRANSFER') {
      balanceChange = -amount;
    } else if (transactionType === 'INCOME') {
      balanceChange = amount;
    }
  }

  return balanceChange;
}

/**
 * Update account balance considering account type and transaction type
 *
 * This function handles the complex logic of how different transaction types
 * affect different account types, particularly credit cards.
 *
 * @param options - Balance update options
 * @throws AppError if account not found
 */
export async function updateAccountBalance(options: BalanceUpdateOptions): Promise<void> {
  const { accountId, accountType, transactionType, amount, operation } = options;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { balance: true, creditLimit: true, type: true },
  });

  if (!account) {
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  let balanceChange = calculateBalanceChange(accountType, transactionType, amount);

  // If operation is subtract, reverse the change
  if (operation === 'subtract') {
    balanceChange = -balanceChange;
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { balance: { increment: balanceChange } },
  });
}

/**
 * Validate and prepare transfer accounts
 *
 * @param fromAccountId - Source account ID
 * @param toAccountId - Destination account ID
 * @param userId - User ID who owns the accounts
 * @returns Object with both account details
 * @throws AppError if accounts don't exist or have different currencies
 */
export async function validateTransferAccounts(
  fromAccountId: string,
  toAccountId: string,
  userId: string
) {
  const [fromAccount, toAccount] = await Promise.all([
    prisma.account.findFirst({
      where: { id: fromAccountId, userId },
    }),
    prisma.account.findFirst({
      where: { id: toAccountId, userId },
    }),
  ]);

  if (!fromAccount) {
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  if (!toAccount) {
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  // Verify accounts have same currency
  if (fromAccount.currency !== toAccount.currency) {
    throw new AppError(ErrorCodes.TRANSACTION_INVALID_ACCOUNT, 400);
  }

  return { fromAccount, toAccount };
}

/**
 * Update balances for a transfer transaction
 *
 * @param fromAccountId - Source account ID
 * @param fromAccountType - Source account type
 * @param toAccountId - Destination account ID
 * @param toAccountType - Destination account type
 * @param amount - Transfer amount
 * @param tx - Optional Prisma transaction client
 */
export async function updateTransferBalances(
  fromAccountId: string,
  fromAccountType: string,
  toAccountId: string,
  toAccountType: string,
  amount: number,
  tx?: any
) {
  const prismaClient = tx || prisma;

  // Calculate balance changes
  const fromBalanceChange = calculateBalanceChange(fromAccountType, 'TRANSFER', amount);
  const toBalanceChange = calculateBalanceChange(toAccountType, 'INCOME', amount);

  // Update both accounts
  await Promise.all([
    prismaClient.account.update({
      where: { id: fromAccountId },
      data: { balance: { increment: fromBalanceChange } },
    }),
    prismaClient.account.update({
      where: { id: toAccountId },
      data: { balance: { increment: toBalanceChange } },
    }),
  ]);
}
