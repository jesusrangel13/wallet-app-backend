import { prisma } from '../utils/prisma';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

/**
 * Shared Expense Settlement Service
 *
 * Extracted from sharedExpense.service.ts as part of OPT-11 refactoring.
 * Handles settlement-related helper functions for shared expenses.
 *
 * Responsibilities:
 * - Helper functions for creating settlement transactions
 * - Fetching settlement-related account information
 * - Validating settlement permissions
 */

export interface SettlementUsers {
  debtor: {
    id: string;
    name: string;
    defaultAccountId?: string | null;
  } | null;
  payee: {
    id: string;
    name: string;
    defaultAccountId?: string | null;
  } | null;
}

export interface SettlementAccounts {
  debtorAccountId: string | null | undefined;
  payeeAccountId: string | null | undefined;
}

/**
 * Fetch users involved in a settlement with their account information
 *
 * @param debtorUserId - ID of user who owes money
 * @param payeeUserId - ID of user who should receive money
 * @returns Object with both user details
 */
export async function fetchSettlementUsers(
  debtorUserId: string,
  payeeUserId: string
): Promise<SettlementUsers> {
  const [debtorUser, payeeUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: debtorUserId },
      select: {
        id: true,
        name: true,
        defaultSharedExpenseAccountId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: payeeUserId },
      select: {
        id: true,
        name: true,
        defaultSharedExpenseAccountId: true,
      },
    }),
  ]);

  return {
    debtor: debtorUser
      ? {
          id: debtorUser.id,
          name: debtorUser.name,
          defaultAccountId: debtorUser.defaultSharedExpenseAccountId,
        }
      : null,
    payee: payeeUser
      ? {
          id: payeeUser.id,
          name: payeeUser.name,
          defaultAccountId: payeeUser.defaultSharedExpenseAccountId,
        }
      : null,
  };
}

/**
 * Determine which accounts to use for settlement based on who initiated
 *
 * @param currentUserId - ID of user initiating the settlement
 * @param debtorUserId - ID of user who owes money
 * @param accountId - Optional account ID specified by initiator
 * @param users - Settlement users with default account info
 * @returns Object with account IDs to use
 */
export function determineSettlementAccounts(
  currentUserId: string,
  debtorUserId: string,
  accountId: string | undefined,
  users: SettlementUsers
): SettlementAccounts {
  const currentUserIsDebtor = currentUserId === debtorUserId;

  let debtorAccountId: string | null | undefined;
  let payeeAccountId: string | null | undefined;

  if (currentUserIsDebtor) {
    // Debtor is initiating, use their selected account (or default)
    debtorAccountId = accountId || users.debtor?.defaultAccountId;
    payeeAccountId = users.payee?.defaultAccountId;
  } else {
    // Payee is initiating (confirming payment), use their selected account (or default)
    debtorAccountId = users.debtor?.defaultAccountId;
    payeeAccountId = accountId || users.payee?.defaultAccountId;
  }

  return { debtorAccountId, payeeAccountId };
}

/**
 * Verify settlement accounts exist and are valid
 *
 * @param debtorAccountId - Debtor's account ID
 * @param debtorUserId - Debtor's user ID
 * @param payeeAccountId - Payee's account ID
 * @param payeeUserId - Payee's user ID
 * @returns Object with verified account details or null if invalid
 */
export async function verifySettlementAccounts(
  debtorAccountId: string,
  debtorUserId: string,
  payeeAccountId: string,
  payeeUserId: string
) {
  const [debtorAccount, payeeAccount] = await Promise.all([
    prisma.account.findFirst({
      where: { id: debtorAccountId, userId: debtorUserId, isArchived: false },
    }),
    prisma.account.findFirst({
      where: { id: payeeAccountId, userId: payeeUserId, isArchived: false },
    }),
  ]);

  if (!debtorAccount || !payeeAccount) {
    return null;
  }

  return { debtorAccount, payeeAccount };
}

/**
 * Fetch debt payment category templates
 *
 * @returns Object with debt payment and collection category IDs
 */
export async function fetchDebtCategories() {
  const [debtPaymentCategory, debtCollectionCategory] = await Promise.all([
    prisma.categoryTemplate.findFirst({
      where: {
        name: 'Pago de deuda',
        type: 'EXPENSE',
      },
    }),
    prisma.categoryTemplate.findFirst({
      where: {
        name: 'Cobro de deuda',
        type: 'INCOME',
      },
    }),
  ]);

  return {
    debtPaymentCategoryId: debtPaymentCategory?.id,
    debtCollectionCategoryId: debtCollectionCategory?.id,
  };
}

/**
 * Create transaction records for a settlement
 *
 * This is a helper that prepares the data for transaction creation.
 * The actual transaction creation should be done by the transaction service.
 *
 * @param debtorUserId - ID of user who owes money
 * @param payeeUserId - ID of user who receives money
 * @param amount - Settlement amount
 * @param debtorAccountId - Debtor's account ID
 * @param payeeAccountId - Payee's account ID
 * @param description - Description for transactions
 * @param expenseId - Optional shared expense ID to link
 * @param categories - Debt category IDs
 * @returns Transaction data for both users
 */
export function prepareSettlementTransactions(
  debtorUserId: string,
  debtorUserName: string,
  payeeUserId: string,
  payeeUserName: string,
  amount: number,
  debtorAccountId: string,
  payeeAccountId: string,
  description: string,
  expenseId: string | undefined,
  categories: { debtPaymentCategoryId?: string; debtCollectionCategoryId?: string }
) {
  return {
    debtorTransaction: {
      userId: debtorUserId,
      data: {
        amount,
        type: 'EXPENSE' as const,
        accountId: debtorAccountId,
        categoryId: categories.debtPaymentCategoryId,
        description: `Pago a ${payeeUserName} por "${description}"`,
        date: new Date().toISOString(),
        sharedExpenseId: expenseId,
        tags: [],
      },
    },
    payeeTransaction: {
      userId: payeeUserId,
      data: {
        amount,
        type: 'INCOME' as const,
        accountId: payeeAccountId,
        categoryId: categories.debtCollectionCategoryId,
        description: `Recibido de ${debtorUserName} por "${description}"`,
        date: new Date().toISOString(),
        sharedExpenseId: expenseId,
        tags: [],
      },
    },
  };
}
