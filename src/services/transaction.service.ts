import { PrismaClient, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { UserCategoryService } from './userCategory.service';
import {
  resolveCategoryById,
  resolveCategoriesBatch,
  validateCategoryId,
  searchCategoriesByName,
} from './categoryResolver.service';

// Template-based category system is now the default system
const prisma = new PrismaClient();

interface CreateTransactionData {
  accountId: string;
  type: TransactionType;
  amount: number;
  categoryId?: string;
  description?: string;
  date?: string;
  receiptUrl?: string;
  payee?: string;
  payer?: string;
  toAccountId?: string; // For transfers
  sharedExpenseId?: string | null;
  tags?: string[]; // Array of tag IDs
}

interface UpdateTransactionData {
  accountId?: string;
  type?: TransactionType;
  amount?: number;
  categoryId?: string;
  description?: string;
  date?: string;
  receiptUrl?: string;
  payee?: string;
  payer?: string;
  toAccountId?: string;
  sharedExpenseId?: string | null;
  tags?: string[];
}

interface TransactionFilters {
  accountId?: string;
  type?: TransactionType;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  tags?: string[];
  search?: string; // Text search in description, payee, amount, category
  sortBy?: 'date' | 'amount' | 'payee'; // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort direction
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export const createTransaction = async (
  userId: string,
  data: CreateTransactionData
) => {
  // OPTIMIZATION: Parallelize all validation queries using Promise.all
  const [user, account, categoryInfo, toAccount, tags] = await Promise.all([
    // Get user info for default payer
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),

    // Verify account belongs to user
    prisma.account.findFirst({
      where: { id: data.accountId, userId },
    }),

    // Verify and resolve category if provided (combined operation)
    data.categoryId
      ? resolveCategoryById(data.categoryId, userId)
      : Promise.resolve(null),

    // For transfers, verify toAccount
    data.type === 'TRANSFER' && data.toAccountId
      ? prisma.account.findFirst({
        where: { id: data.toAccountId, userId },
      })
      : Promise.resolve(null),

    // Verify tags if provided
    data.tags && data.tags.length > 0
      ? prisma.tag.findMany({
        where: { id: { in: data.tags }, userId },
      })
      : Promise.resolve([]),
  ]);

  // Validate results
  if (!account) {
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  if (data.categoryId && !categoryInfo) {
    console.error(`❌ Category validation failed for ID: ${data.categoryId}`);
    throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
  }

  if (data.type === 'TRANSFER') {
    if (!data.toAccountId) {
      throw new AppError(ErrorCodes.TRANSACTION_INVALID_ACCOUNT, 400);
    }

    if (!toAccount) {
      throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
    }

    // Verify accounts have same currency
    if (account.currency !== toAccount.currency) {
      throw new AppError(ErrorCodes.TRANSACTION_INVALID_ACCOUNT, 400);
    }
  }

  if (data.tags && data.tags.length > 0 && tags.length !== data.tags.length) {
    throw new AppError(ErrorCodes.TAG_NOT_FOUND, 404);
  }

  // OPTIMIZATION: Use database transaction for atomicity and batch balance updates
  const result = await prisma.$transaction(async (tx) => {
    // Create transaction with tags
    const transaction = await tx.transaction.create({
      data: {
        userId,
        accountId: data.accountId,
        type: data.type,
        amount: data.amount,
        categoryId: data.categoryId,
        description: data.description,
        date: data.date ? new Date(data.date) : new Date(),
        receiptUrl: data.receiptUrl,
        payee: data.payee,
        payer: data.payer || user?.name, // Default to user's name
        toAccountId: data.toAccountId,
        sharedExpenseId: data.sharedExpenseId,
        tags: data.tags
          ? {
            create: data.tags.map((tagId) => ({
              tag: { connect: { id: tagId } },
            })),
          }
          : undefined,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        account: {
          select: { name: true, currency: true, type: true },
        },
        toAccount: {
          select: { name: true, currency: true },
        },
      },
    });

    // Calculate balance changes
    let balanceChange = data.amount;
    if (account.type === 'CREDIT') {
      balanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
    } else {
      balanceChange = data.type === 'INCOME' ? data.amount : -data.amount;
    }

    // Update source account balance
    await tx.account.update({
      where: { id: account.id },
      data: { balance: { increment: balanceChange } },
    });

    // For transfers, update destination account balance
    if (data.type === 'TRANSFER' && toAccount) {
      const toBalanceChange = toAccount.type === 'CREDIT' ? data.amount : data.amount;
      await tx.account.update({
        where: { id: toAccount.id },
        data: { balance: { increment: toBalanceChange } },
      });
    }

    return transaction;
  });

  // OPTIMIZATION: Return category info resolved during validation (no redundant DB query)

  // LEARNING: Async learn from this transaction pattern
  // If we have a payee and a category, we can learn this association
  if (data.payee && data.categoryId) {
    // Import dynamically to avoid circular dependencies if any (though SmartMatcher is leaf)
    // Or just instantiate if imported
    import('./voice/smartMatcher.service').then(({ SmartMatcherService }) => {
      const matcher = new SmartMatcherService();
      // We learn that this PAYEE maps to this CATEGORY
      matcher.learn(userId, data.payee!, data.categoryId!, data.payee);
    }).catch(err => console.error("Failed to trigger smart learning", err));
  }

  return { ...result, category: categoryInfo };
};

// Helper function to update account balance considering credit cards
async function updateAccountBalance(
  accountId: string,
  accountType: string,
  transactionType: TransactionType,
  amount: number,
  operation: 'add' | 'subtract'
) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { balance: true, creditLimit: true, type: true },
  });

  if (!account) {
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

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

  // If operation is subtract, reverse the change
  if (operation === 'subtract') {
    balanceChange = -balanceChange;
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { balance: { increment: balanceChange } },
  });
}

export const getTransactions = async (
  userId: string,
  filters: TransactionFilters
): Promise<PaginatedResponse<any>> => {
  const where: any = { userId };

  if (filters.accountId) {
    where.accountId = filters.accountId;
  }

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.categoryId) {
    // Template system: categoryId refers to UserCategoryOverride or template
    // Use exact match - templates handle hierarchy internally
    where.categoryId = filters.categoryId;
  }

  if (filters.startDate || filters.endDate) {
    where.date = {};
    if (filters.startDate) {
      where.date.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.date.lte = new Date(filters.endDate);
    }
  }

  if (filters.minAmount || filters.maxAmount) {
    where.amount = {};
    if (filters.minAmount) {
      where.amount.gte = filters.minAmount;
    }
    if (filters.maxAmount) {
      where.amount.lte = filters.maxAmount;
    }
  }

  if (filters.tags && filters.tags.length > 0) {
    where.tags = {
      some: {
        tagId: { in: filters.tags },
      },
    };
  }

  // Text search in description, payee, amount, and category name
  if (filters.search) {
    const searchTerm = filters.search.trim();
    const numericSearch = parseFloat(searchTerm);

    // Get category IDs that match the search term
    const matchingCategoryIds = await searchCategoriesByName(searchTerm, userId);

    where.OR = [
      { description: { contains: searchTerm, mode: 'insensitive' } },
      { payee: { contains: searchTerm, mode: 'insensitive' } },
      // Search by amount if search term is numeric
      ...(isNaN(numericSearch) ? [] : [{ amount: { equals: numericSearch } }]),
      // Search by category IDs
      ...(matchingCategoryIds.length > 0
        ? [{ categoryId: { in: matchingCategoryIds } }]
        : []),
    ];
  }

  // Pagination parameters
  const page = Math.max(filters.page || 1, 1);
  const limit = Math.min(filters.limit || 50, 500); // Max 500 per page
  const skip = (page - 1) * limit;

  // Determine sort order
  let orderBy: any = { date: 'desc' }; // default
  if (filters.sortBy && filters.sortOrder) {
    orderBy = { [filters.sortBy]: filters.sortOrder };
  } else if (filters.sortBy) {
    orderBy = { [filters.sortBy]: 'desc' }; // default to desc if sortOrder not specified
  }

  // OPTIMIZATION: Run count and findMany in parallel
  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        account: {
          select: { name: true, currency: true, type: true },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        toAccount: {
          select: { name: true, currency: true },
        },
        // OPTIMIZATION: lighter include for shared expense
        sharedExpense: {
          select: {
            id: true,
            description: true,
            groupId: true,
            paidByUserId: true,
            // Only fetch minimal participant info if absolutely needed, or maybe skip it for list view?
            // Checking frontend usage: usually transaction list just shows an icon "Shared".
            // We'll keep it minimal.
            participants: {
              // UI Requirement: List needs to show status of ALL participants
              select: {
                isPaid: true,
                userId: true,
                amountOwed: true,
                // Include user name for tooltips/avatars if needed in UI
                user: {
                  select: { name: true }
                }
              }
            },
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    })
  ]);

  // Resolve categories for all transactions in batch
  const categoryIds = transactions.map((t) => t.categoryId);
  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  // Add category info to each transaction
  const transactionsWithCategories = transactions.map((t) => ({
    ...t,
    category: t.categoryId ? categoryMap.get(t.categoryId) || null : null,
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    data: transactionsWithCategories,
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  };
};

export const getTransactionById = async (userId: string, transactionId: string) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    include: {
      account: {
        select: { name: true, currency: true, type: true },
      },
      tags: {
        include: {
          tag: true,
        },
      },
      toAccount: {
        select: { name: true, currency: true },
      },
      sharedExpense: {
        include: {
          group: {
            select: { name: true },
          },
          participants: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  if (!transaction) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_FOUND, 404);
  }

  // Resolve category information
  const category = await resolveCategoryById(transaction.categoryId, userId);

  return { ...transaction, category };
};

export const updateTransaction = async (
  userId: string,
  transactionId: string,
  data: UpdateTransactionData
) => {
  // Get existing transaction
  const existingTransaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    include: {
      account: true,
      toAccount: true,
    },
  });

  if (!existingTransaction) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_FOUND, 404);
  }

  // If account is changing, verify new account
  if (data.accountId && data.accountId !== existingTransaction.accountId) {
    const newAccount = await prisma.account.findFirst({
      where: { id: data.accountId, userId },
    });

    if (!newAccount) {
      throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
    }

    // Revert balance change on old account
    await updateAccountBalance(
      existingTransaction.accountId,
      existingTransaction.account.type,
      existingTransaction.type,
      Number(existingTransaction.amount),
      'subtract'
    );

    // Apply balance change to new account
    await updateAccountBalance(
      newAccount.id,
      newAccount.type,
      data.type || existingTransaction.type,
      data.amount || Number(existingTransaction.amount),
      'add'
    );
  } else if (data.amount !== undefined || data.type !== undefined) {
    // If amount or type is changing, update balance
    // Revert old balance change
    await updateAccountBalance(
      existingTransaction.accountId,
      existingTransaction.account.type,
      existingTransaction.type,
      Number(existingTransaction.amount),
      'subtract'
    );

    // Apply new balance change
    await updateAccountBalance(
      existingTransaction.accountId,
      existingTransaction.account.type,
      data.type || existingTransaction.type,
      data.amount || Number(existingTransaction.amount),
      'add'
    );
  }

  // Handle transfer account changes
  if (data.type === 'TRANSFER' || existingTransaction.type === 'TRANSFER') {
    // If it was a transfer and toAccount is changing
    if (
      existingTransaction.toAccountId &&
      data.toAccountId &&
      data.toAccountId !== existingTransaction.toAccountId
    ) {
      // Revert old toAccount balance
      if (existingTransaction.toAccount) {
        await updateAccountBalance(
          existingTransaction.toAccountId,
          existingTransaction.toAccount.type,
          'INCOME',
          Number(existingTransaction.amount),
          'subtract'
        );
      }

      // Apply to new toAccount
      const newToAccount = await prisma.account.findUnique({
        where: { id: data.toAccountId },
      });
      if (newToAccount) {
        await updateAccountBalance(
          newToAccount.id,
          newToAccount.type,
          'INCOME',
          data.amount || Number(existingTransaction.amount),
          'add'
        );
      }
    }
  }

  // Verify category if provided
  // Categories can come from: CategoryTemplate or UserCategoryOverride
  if (data.categoryId) {
    const isValidCategory = await validateCategoryId(data.categoryId, userId);

    if (!isValidCategory) {
      console.error(`❌ Category validation failed for ID: ${data.categoryId}`);
      throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
    }
  }

  // Handle shared expense validation and update
  if (data.sharedExpenseId !== undefined) {
    if (data.sharedExpenseId === null) {
      // User wants to remove shared expense from transaction
      // No validation needed, just set to null
    } else if (data.sharedExpenseId) {
      // User wants to add/update shared expense
      // Verify the shared expense exists and user has access
      const sharedExpense = await prisma.sharedExpense.findFirst({
        where: {
          id: data.sharedExpenseId,
          group: {
            members: {
              some: {
                userId,
              },
            },
          },
        },
      });

      if (!sharedExpense) {
        throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_FOUND, 404);
      }
    }
  }

  // Handle tags update
  if (data.tags !== undefined) {
    // Verify all tags exist
    if (data.tags.length > 0) {
      const tags = await prisma.tag.findMany({
        where: { id: { in: data.tags }, userId },
      });

      if (tags.length !== data.tags.length) {
        throw new AppError(ErrorCodes.TAG_NOT_FOUND, 404);
      }
    }

    // Delete existing tag relations
    await prisma.transactionTag.deleteMany({
      where: { transactionId },
    });

    // Create new tag relations
    if (data.tags.length > 0) {
      await prisma.transactionTag.createMany({
        data: data.tags.map((tagId) => ({
          transactionId,
          tagId,
        })),
      });
    }
  }

  // Update transaction
  const transaction = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      accountId: data.accountId,
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      description: data.description,
      date: data.date ? new Date(data.date) : undefined,
      receiptUrl: data.receiptUrl,
      payee: data.payee,
      payer: data.payer,
      toAccountId: data.toAccountId,
      sharedExpenseId: data.sharedExpenseId !== undefined ? data.sharedExpenseId : undefined,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
      account: {
        select: { name: true, currency: true, type: true },
      },
      toAccount: {
        select: { name: true, currency: true },
      },
    },
  });

  // Resolve category information
  const category = await resolveCategoryById(transaction.categoryId, userId);

  return { ...transaction, category };
};

export const deleteTransaction = async (userId: string, transactionId: string) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    include: {
      account: true,
      toAccount: true,
    },
  });

  if (!transaction) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_FOUND, 404);
  }

  // Check if this is a shared expense transaction
  if (transaction.sharedExpenseId) {
    // Load the shared expense with all its linked transactions
    const sharedExpense = await prisma.sharedExpense.findUnique({
      where: { id: transaction.sharedExpenseId },
      include: {
        transactions: {
          include: {
            account: true,
            toAccount: true,
          },
        },
        paidBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!sharedExpense) {
      throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_FOUND, 404);
    }

    // Normalizar IDs para comparación robusta
    const normalizedPaidByUserId = sharedExpense.paidByUserId.trim().toLowerCase();
    const normalizedRequestingUserId = userId.trim().toLowerCase();

    // DEBUG: Log detallado para entender el problema
    console.log('🔍 DELETE SHARED EXPENSE - DEBUG INFO:', {
      sharedExpenseId: sharedExpense.id,
      paidByUserId: sharedExpense.paidByUserId,
      paidByUserIdLength: sharedExpense.paidByUserId.length,
      paidByUserIdType: typeof sharedExpense.paidByUserId,
      paidByEmail: sharedExpense.paidBy.email,
      requestingUserId: userId,
      requestingUserIdLength: userId.length,
      requestingUserIdType: typeof userId,
      normalizedPaidByUserId,
      normalizedRequestingUserId,
      normalizedMatch: normalizedPaidByUserId === normalizedRequestingUserId,
      directMatch: sharedExpense.paidByUserId === userId,
    });

    // VALIDATION: Only the person who paid can delete the shared expense
    // Usamos IDs normalizados para manejar diferencias en mayúsculas/minúsculas o espacios
    if (normalizedPaidByUserId !== normalizedRequestingUserId) {
      throw new AppError(
        ErrorCodes.SHARED_EXPENSE_ONLY_PAYER_CAN_DELETE,
        403
      );
    }

    // Use database transaction for atomicity
    return await prisma.$transaction(async (tx) => {
      // 1. Revert balances for ALL linked transactions
      for (const trans of sharedExpense.transactions) {
        await updateAccountBalance(
          trans.accountId,
          trans.account.type,
          trans.type,
          Number(trans.amount),
          'subtract'
        );

        // If it's a transfer, revert destination account
        if (trans.type === 'TRANSFER' && trans.toAccountId && trans.toAccount) {
          await updateAccountBalance(
            trans.toAccountId,
            trans.toAccount.type,
            'INCOME',
            Number(trans.amount),
            'subtract'
          );
        }
      }

      // 2. Delete the SharedExpense (this will delete ExpenseParticipant via cascade
      //    and set sharedExpenseId to NULL on transactions)
      await tx.sharedExpense.delete({
        where: { id: sharedExpense.id },
      });

      // 3. Delete ALL linked transactions
      await tx.transaction.deleteMany({
        where: {
          id: {
            in: sharedExpense.transactions.map(t => t.id),
          },
        },
      });

      return {
        message: 'Gasto compartido y todas las transacciones vinculadas eliminadas exitosamente',
        deletedTransactions: sharedExpense.transactions.length,
      };
    });
  }

  // If NOT a shared expense, continue with normal deletion logic
  // Revert balance change
  await updateAccountBalance(
    transaction.accountId,
    transaction.account.type,
    transaction.type,
    Number(transaction.amount),
    'subtract'
  );

  // For transfers, revert destination account
  if (transaction.type === 'TRANSFER' && transaction.toAccountId && transaction.toAccount) {
    await updateAccountBalance(
      transaction.toAccountId,
      transaction.toAccount.type,
      'INCOME',
      Number(transaction.amount),
      'subtract'
    );
  }

  // Delete transaction (tags will be deleted automatically due to cascade)
  await prisma.transaction.delete({
    where: { id: transactionId },
  });

  return { message: 'Transaction deleted successfully' };
};

export const getTransactionsByCategory = async (userId: string) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    select: {
      categoryId: true,
      type: true,
      amount: true,
    },
  });

  // Resolve all categories in batch
  const categoryIds = transactions.map((t) => t.categoryId);
  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  // Group by category
  const byCategory: Record<
    string,
    { income: number; expense: number; categoryName: string; icon?: string; color?: string }
  > = {};

  transactions.forEach((t) => {
    const categoryKey = t.categoryId || 'uncategorized';
    const categoryInfo = t.categoryId ? categoryMap.get(t.categoryId) : null;
    const categoryName = categoryInfo?.name || 'Uncategorized';

    if (!byCategory[categoryKey]) {
      byCategory[categoryKey] = {
        income: 0,
        expense: 0,
        categoryName,
        icon: categoryInfo?.icon || undefined,
        color: categoryInfo?.color || undefined,
      };
    }

    if (t.type === 'INCOME') {
      byCategory[categoryKey].income += Number(t.amount);
    } else if (t.type === 'EXPENSE') {
      byCategory[categoryKey].expense += Number(t.amount);
    }
  });

  return byCategory;
};

export const getTransactionStats = async (userId: string, month: number, year: number) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Find categories to exclude from stats
  const [prestamoOtorgadoCategory, cobroPrestamoCategory, cobroDeudaCategory] = await Promise.all([
    prisma.categoryTemplate.findFirst({
      where: { name: 'Préstamo otorgado', type: 'EXPENSE' },
    }),
    prisma.categoryTemplate.findFirst({
      where: { name: 'Cobro de préstamo', type: 'INCOME' },
    }),
    prisma.categoryTemplate.findFirst({
      where: { name: 'Cobro de deuda', type: 'INCOME' },
    }),
  ]);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      loanId: null, // Exclude loan disbursements
    },
    select: {
      categoryId: true,
      type: true,
      amount: true,
    },
  });

  // Resolve all categories in batch
  const categoryIds = transactions.map((t) => t.categoryId);
  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  const stats = {
    totalIncome: 0,
    totalExpense: 0,
    totalTransactions: transactions.length,
    byCategory: {} as Record<
      string,
      { amount: number; categoryName: string; icon?: string; color?: string }
    >,
  };

  transactions.forEach((t) => {
    const categoryKey = t.categoryId || 'uncategorized';
    const categoryInfo = t.categoryId ? categoryMap.get(t.categoryId) : null;
    const categoryName = categoryInfo?.name || 'Uncategorized';

    // Skip loan repayments and shared expense settlements from income
    const isLoanRepayment = cobroPrestamoCategory && t.categoryId === cobroPrestamoCategory.id;
    const isDebtCollection = cobroDeudaCategory && t.categoryId === cobroDeudaCategory.id;

    if (t.type === 'INCOME' && !isLoanRepayment && !isDebtCollection) {
      stats.totalIncome += Number(t.amount);
    } else if (t.type === 'EXPENSE') {
      stats.totalExpense += Number(t.amount);

      if (!stats.byCategory[categoryKey]) {
        stats.byCategory[categoryKey] = {
          amount: 0,
          categoryName,
          icon: categoryInfo?.icon || undefined,
          color: categoryInfo?.color || undefined,
        };
      }
      stats.byCategory[categoryKey].amount += Number(t.amount);
    }
  });

  return stats;
};

export const bulkDeleteTransactions = async (
  userId: string,
  transactionIds: string[]
) => {
  if (!transactionIds || transactionIds.length === 0) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 400);
  }

  // Verify all transactions belong to the user
  const transactions = await prisma.transaction.findMany({
    where: {
      id: {
        in: transactionIds,
      },
      userId,
    },
    select: {
      id: true,
      sharedExpenseId: true,
    },
  });

  if (transactions.length !== transactionIds.length) {
    throw new AppError(ErrorCodes.TRANSACTION_NOT_FOUND, 404);
  }

  // Delete each transaction individually to properly handle balances and shared expenses
  let deletedCount = 0;
  const results = [];
  const errors = [];

  for (const transactionId of transactionIds) {
    try {
      const result = await deleteTransaction(userId, transactionId);
      deletedCount++;
      results.push({ transactionId, success: true, ...result });
    } catch (error: any) {
      // If deletion fails (e.g., no permission to delete shared expense), log and continue
      console.error(`Error deleting transaction ${transactionId}:`, error.message);
      errors.push({
        transactionId,
        success: false,
        error: error.message
      });
    }
  }

  return {
    deletedCount,
    totalRequested: transactionIds.length,
    results,
    errors,
    message: `${deletedCount} de ${transactionIds.length} transacciones eliminadas exitosamente`,
  };
};

export const getRecentTransactions = async (userId: string, limit: number = 5) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
        },
      },
    },
    orderBy: {
      date: 'desc',
    },
    take: limit,
  });

  // Resolve categories for all transactions in batch
  const categoryIds = transactions.map((t) => t.categoryId);
  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  // Add category info to each transaction
  const transactionsWithCategories = transactions.map((t) => ({
    ...t,
    category: t.categoryId ? categoryMap.get(t.categoryId) || null : null,
  }));

  return transactionsWithCategories;
};

export const getUniquePayees = async (userId: string, search?: string): Promise<string[]> => {
  const where: any = {
    userId,
    payee: {
      not: null, // Excluir transacciones sin payee
    },
  };

  // Si hay término de búsqueda, filtrar payees
  if (search && search.trim()) {
    where.payee = {
      contains: search.trim(),
      mode: 'insensitive',
      not: null,
    };
  }

  // Obtener payees únicos usando Prisma
  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      payee: true,
    },
    distinct: ['payee'],
    orderBy: {
      date: 'desc', // Más recientes primero
    },
    take: 50, // Limitar a 50 resultados
  });

  // Filtrar nulls y retornar solo los strings
  return transactions
    .map(t => t.payee)
    .filter((payee): payee is string => payee !== null && payee.trim() !== '');
};
