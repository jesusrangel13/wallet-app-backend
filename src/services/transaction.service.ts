import { PrismaClient, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

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
  sharedExpenseId?: string;
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
  sharedExpenseId?: string;
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
  // Get user info for default payer
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  // Verify account belongs to user
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  // Verify category if provided
  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
    }
  }

  // For transfers, verify toAccount
  if (data.type === 'TRANSFER') {
    if (!data.toAccountId) {
      throw new AppError('Destination account is required for transfers', 400);
    }

    const toAccount = await prisma.account.findFirst({
      where: { id: data.toAccountId, userId },
    });

    if (!toAccount) {
      throw new AppError('Destination account not found', 404);
    }

    // Verify accounts have same currency
    if (account.currency !== toAccount.currency) {
      throw new AppError('Cannot transfer between accounts with different currencies', 400);
    }
  }

  // Verify tags if provided
  if (data.tags && data.tags.length > 0) {
    const tags = await prisma.tag.findMany({
      where: { id: { in: data.tags }, userId },
    });

    if (tags.length !== data.tags.length) {
      throw new AppError('One or more tags not found', 404);
    }
  }

  // Create transaction with tags
  const transaction = await prisma.transaction.create({
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
      category: true,
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

  // Update account balance based on transaction type and account type
  await updateAccountBalance(account.id, account.type, data.type, data.amount, 'add');

  // For transfers, update destination account
  if (data.type === 'TRANSFER' && data.toAccountId) {
    const toAccount = await prisma.account.findUnique({
      where: { id: data.toAccountId },
    });
    if (toAccount) {
      await updateAccountBalance(toAccount.id, toAccount.type, 'INCOME', data.amount, 'add');
    }
  }

  return transaction;
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
    throw new AppError('Account not found', 404);
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
    // Check if this category has subcategories (is a parent category)
    const selectedCategory = await prisma.category.findUnique({
      where: { id: filters.categoryId },
      include: { subcategories: { select: { id: true } } }
    });

    if (selectedCategory?.subcategories && selectedCategory.subcategories.length > 0) {
      // Parent category: include this category AND all its subcategories
      const subcategoryIds = selectedCategory.subcategories.map(sub => sub.id);
      where.OR = [
        { categoryId: filters.categoryId },
        { categoryId: { in: subcategoryIds } }
      ];
    } else {
      // Child category or category without subcategories: exact match
      where.categoryId = filters.categoryId;
    }
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

    where.OR = [
      { description: { contains: searchTerm, mode: 'insensitive' } },
      { payee: { contains: searchTerm, mode: 'insensitive' } },
      // Search by amount if search term is numeric
      ...(isNaN(numericSearch) ? [] : [{ amount: { equals: numericSearch } }]),
      // Search by category name
      {
        category: {
          name: { contains: searchTerm, mode: 'insensitive' },
        },
      },
    ];
  }

  // Pagination parameters
  const page = Math.max(filters.page || 1, 1);
  const limit = Math.min(filters.limit || 50, 500); // Max 500 per page
  const skip = (page - 1) * limit;

  // Get total count for pagination
  const total = await prisma.transaction.count({ where });

  // Determine sort order
  let orderBy: any = { date: 'desc' }; // default
  if (filters.sortBy && filters.sortOrder) {
    orderBy = { [filters.sortBy]: filters.sortOrder };
  } else if (filters.sortBy) {
    orderBy = { [filters.sortBy]: 'desc' }; // default to desc if sortOrder not specified
  }

  // Get paginated transactions
  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      account: {
        select: { name: true, currency: true, type: true },
      },
      category: {
        select: { name: true, icon: true, color: true, parent: true },
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
        select: { id: true, description: true, groupId: true },
      },
    },
    orderBy,
    skip,
    take: limit,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    data: transactions,
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
      category: {
        select: { name: true, icon: true, color: true, parent: true },
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
    throw new AppError('Transaction not found', 404);
  }

  return transaction;
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
    throw new AppError('Transaction not found', 404);
  }

  // If account is changing, verify new account
  if (data.accountId && data.accountId !== existingTransaction.accountId) {
    const newAccount = await prisma.account.findFirst({
      where: { id: data.accountId, userId },
    });

    if (!newAccount) {
      throw new AppError('New account not found', 404);
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
  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId },
    });

    if (!category) {
      throw new AppError('Category not found', 404);
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
        throw new AppError('One or more tags not found', 404);
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
      sharedExpenseId: data.sharedExpenseId,
    },
    include: {
      category: true,
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

  return transaction;
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
    throw new AppError('Transaction not found', 404);
  }

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
    include: {
      category: {
        select: { name: true, icon: true, color: true },
      },
    },
  });

  // Group by category
  const byCategory: Record<
    string,
    { income: number; expense: number; categoryName: string; icon?: string; color?: string }
  > = {};

  transactions.forEach((t) => {
    const categoryKey = t.categoryId || 'uncategorized';
    const categoryName = t.category?.name || 'Uncategorized';

    if (!byCategory[categoryKey]) {
      byCategory[categoryKey] = {
        income: 0,
        expense: 0,
        categoryName,
        icon: t.category?.icon || undefined,
        color: t.category?.color || undefined,
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

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      category: {
        select: { name: true, icon: true, color: true },
      },
    },
  });

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
    const categoryName = t.category?.name || 'Uncategorized';

    if (t.type === 'INCOME') {
      stats.totalIncome += Number(t.amount);
    } else if (t.type === 'EXPENSE') {
      stats.totalExpense += Number(t.amount);

      if (!stats.byCategory[categoryKey]) {
        stats.byCategory[categoryKey] = {
          amount: 0,
          categoryName,
          icon: t.category?.icon || undefined,
          color: t.category?.color || undefined,
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
    throw new AppError('No transaction IDs provided', 400);
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
    throw new AppError('Some transactions not found or do not belong to you', 404);
  }

  // Delete all transactions
  const result = await prisma.transaction.deleteMany({
    where: {
      id: {
        in: transactionIds,
      },
      userId,
    },
  });

  return {
    deletedCount: result.count,
    message: `${result.count} transaction(s) deleted successfully`,
  };
};

export const getRecentTransactions = async (userId: string, limit: number = 5) => {
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
        },
      },
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

  return transactions;
};
