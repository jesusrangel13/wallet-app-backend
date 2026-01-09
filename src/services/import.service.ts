import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { resolveCategoriesBatch } from './categoryResolver.service';
import { createTransaction } from './transaction.service';
import { PaginationParams, calculatePagination, calculateSkip } from '../@types/pagination.types';
import { prisma } from '../utils/prisma';

interface ImportTransactionData {
  row: number;
  date: string;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amount: number;
  description: string;
  categoryId?: string;
  payee?: string; // Recipient/merchant name
  tags?: string[];
  notes?: string;
  receiptUrl?: string;
  // Shared expense fields
  sharedGroup?: string;
  paidBy?: string;
  splitType?: 'EQUAL' | 'PERCENTAGE' | 'SHARES' | 'EXACT';
  participants?: string; // Format: "email1:amount1,email2:amount2"
}

interface ImportResult {
  importHistoryId: string;
  successCount: number;
  failedCount: number;
  transactions: Array<{
    row: number;
    transactionId?: string;
    status: 'SUCCESS' | 'FAILED';
    errorMessage?: string;
  }>;
}

export const importTransactions = async (
  userId: string,
  accountId: string,
  fileName: string,
  fileType: 'CSV' | 'EXCEL',
  transactions: ImportTransactionData[]
): Promise<ImportResult> => {
  // Verify account belongs to user
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      userId,
    },
  });

  if (!account) {
    throw new AppError(ErrorCodes.ACCOUNT_NOT_FOUND, 404);
  }

  // Create import history record with PROCESSING status
  const importHistory = await prisma.importHistory.create({
    data: {
      userId,
      accountId,
      fileName,
      fileType,
      totalRows: transactions.length,
      successCount: 0,
      failedCount: 0,
      status: 'PROCESSING',
    },
  });

  const results: Array<{
    row: number;
    transactionId?: string;
    status: 'SUCCESS' | 'FAILED';
    errorMessage?: string;
  }> = [];

  let successCount = 0;
  let failedCount = 0;

  // Process each transaction
  for (const txData of transactions) {
    try {
      // Find or create tags
      const tagIds: string[] = [];
      if (txData.tags && txData.tags.length > 0) {
        for (const tagName of txData.tags) {
          let tag = await prisma.tag.findFirst({
            where: {
              userId,
              name: tagName,
            },
          });

          if (!tag) {
            tag = await prisma.tag.create({
              data: {
                userId,
                name: tagName,
              },
            });
          }

          tagIds.push(tag.id);
        }
      }

      // Create the transaction using the transaction service
      // This ensures balance updates are properly handled
      let sharedExpenseId: string | undefined = undefined;
      let transaction;

      // If this is a shared expense, create it directly with proper date handling
      if (txData.sharedGroup && txData.paidBy && txData.splitType && txData.participants) {
        // Find the group by name
        const group = await prisma.group.findFirst({
          where: {
            name: txData.sharedGroup,
            members: {
              some: {
                userId,
              },
            },
          },
        });

        if (!group) {
          throw new Error(`Group "${txData.sharedGroup}" not found or you are not a member`);
        }

        // Find the user who paid by email
        const paidByUser = await prisma.user.findUnique({
          where: { email: txData.paidBy },
        });

        if (!paidByUser) {
          throw new Error(`User with email "${txData.paidBy}" not found`);
        }

        // Parse participants: "email1:value1,email2:value2"
        const participantEntries = txData.participants.split(',').map(p => {
          const [email, valueStr] = p.trim().split(':');
          return {
            email: email.trim(),
            value: valueStr?.trim() || '',
          };
        });

        // Validate split type format and values
        if (txData.splitType === 'EQUAL') {
          if (participantEntries.some(p => p.value)) {
            throw new Error('EQUAL split type should not have values in participants (divide equally)');
          }
        } else if (txData.splitType === 'PERCENTAGE') {
          const percentages = participantEntries.map(p => {
            const num = parseFloat(p.value);
            if (isNaN(num) || num <= 0) {
              throw new Error(`Invalid percentage value "${p.value}" for ${p.email}. Must be a positive number.`);
            }
            return num;
          });
          const totalPercentage = percentages.reduce((a, b) => a + b, 0);
          if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new Error(`Percentages must sum to 100. Current sum: ${totalPercentage.toFixed(2)}%`);
          }
        } else if (txData.splitType === 'EXACT') {
          const amounts = participantEntries.map(p => {
            const num = parseFloat(p.value);
            if (isNaN(num) || num <= 0) {
              throw new Error(`Invalid amount value "${p.value}" for ${p.email}. Must be a positive number.`);
            }
            return num;
          });
          const totalAmount = amounts.reduce((a, b) => a + b, 0);
          if (Math.abs(totalAmount - txData.amount) > 0.01) {
            throw new Error(`Amounts must sum to ${txData.amount}. Current sum: ${totalAmount.toFixed(2)}`);
          }
        } else if (txData.splitType === 'SHARES') {
          const shares = participantEntries.map(p => {
            const num = parseInt(p.value, 10);
            if (isNaN(num) || num <= 0 || !Number.isInteger(parseFloat(p.value))) {
              throw new Error(`Invalid shares value "${p.value}" for ${p.email}. Must be a positive integer.`);
            }
            return num;
          });
          const totalShares = shares.reduce((a, b) => a + b, 0);
          if (totalShares === 0) {
            throw new Error('Total shares must be greater than 0');
          }
        }

        // Calculate amounts for storage
        const amounts = participantEntries.map((p, index) => {
          if (txData.splitType === 'EQUAL') {
            return txData.amount / participantEntries.length;
          } else if (txData.splitType === 'PERCENTAGE') {
            const percentage = parseFloat(p.value);
            return (percentage / 100) * txData.amount;
          } else if (txData.splitType === 'EXACT') {
            return parseFloat(p.value);
          } else if (txData.splitType === 'SHARES') {
            const totalShares = participantEntries.reduce((sum, pe) => sum + parseInt(pe.value, 10), 0);
            return (parseInt(p.value, 10) / totalShares) * txData.amount;
          }
          return 0;
        });

        // Validate and get participant user IDs
        const participants = await Promise.all(
          participantEntries.map(async ({ email }, index) => {
            const user = await prisma.user.findUnique({
              where: { email },
            });

            if (!user) {
              throw new Error(`Participant with email "${email}" not found`);
            }

            // Verify participant is a member of the group
            const isMember = await prisma.groupMember.findFirst({
              where: {
                groupId: group.id,
                userId: user.id,
              },
            });

            if (!isMember) {
              throw new Error(`User "${email}" is not a member of group "${txData.sharedGroup}"`);
            }

            return {
              userId: user.id,
              amountOwed: amounts[index],
            };
          })
        );

        // Create the SharedExpense with the original date from import
        const sharedExpense = await prisma.sharedExpense.create({
          data: {
            groupId: group.id,
            paidByUserId: paidByUser.id,
            amount: txData.amount,
            description: txData.description,
            date: new Date(txData.date),
            categoryId: txData.categoryId,
            receiptUrl: txData.receiptUrl,
            splitType: txData.splitType,
            participants: {
              create: participants.map(p => ({
                userId: p.userId,
                amountOwed: p.amountOwed,
              })),
            },
          },
        });

        sharedExpenseId = sharedExpense.id;
      }

      // Create the transaction using the transaction service
      // This ensures proper balance updates for all account types including credit cards
      transaction = await createTransaction(userId, {
        accountId,
        type: txData.type,
        amount: txData.amount,
        description: txData.description,
        categoryId: txData.categoryId,
        payee: txData.payee,
        date: txData.date,
        receiptUrl: txData.receiptUrl,
        sharedExpenseId,
        tags: tagIds.length > 0 ? tagIds : undefined,
      });

      if (!transaction) {
        throw new Error('Failed to create transaction');
      }

      // Create imported transaction record
      await prisma.importedTransaction.create({
        data: {
          importHistoryId: importHistory.id,
          transactionId: transaction.id,
          rowNumber: txData.row,
          status: 'SUCCESS',
          originalDate: txData.date,
          type: txData.type,
          amount: txData.amount.toString(),
          description: txData.description,
          category: txData.categoryId || null,
          tags: txData.tags?.join(', ') || null,
          notes: txData.notes || null,
        },
      });

      results.push({
        row: txData.row,
        transactionId: transaction.id,
        status: 'SUCCESS',
      });

      successCount++;
    } catch (error: any) {
      // Create failed imported transaction record
      await prisma.importedTransaction.create({
        data: {
          importHistoryId: importHistory.id,
          transactionId: null,
          rowNumber: txData.row,
          status: 'FAILED',
          errorMessage: error.message || 'Unknown error',
          originalDate: txData.date,
          type: txData.type,
          amount: txData.amount.toString(),
          description: txData.description,
          category: txData.categoryId || null,
          tags: txData.tags?.join(', ') || null,
          notes: txData.notes || null,
        },
      });

      results.push({
        row: txData.row,
        status: 'FAILED',
        errorMessage: error.message || 'Unknown error',
      });

      failedCount++;
    }
  }

  // Determine final status
  const finalStatus = failedCount === transactions.length ? 'FAILED' : 'COMPLETED';

  // Update import history with final counts and status
  await prisma.importHistory.update({
    where: { id: importHistory.id },
    data: {
      successCount,
      failedCount,
      status: finalStatus,
      completedAt: new Date(),
    },
  });

  return {
    importHistoryId: importHistory.id,
    successCount,
    failedCount,
    transactions: results,
  };
};

export const getImportHistory = async (userId: string, pagination?: PaginationParams) => {
  // Pagination parameters
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 20, 100); // Max 100 per page
  const skip = calculateSkip(page, limit);

  // Get total count for pagination metadata
  const total = await prisma.importHistory.count({ where: { userId } });

  // Get paginated imports
  const imports = await prisma.importHistory.findMany({
    where: { userId },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
        },
      },
      importedTransactions: {
        include: {
          transaction: {
            select: {
              id: true,
              amount: true,
              description: true,
              date: true,
            },
          },
        },
      },
    },
    orderBy: {
      importedAt: 'desc',
    },
    skip,
    take: limit,
  });

  return {
    data: imports,
    pagination: calculatePagination(page, limit, total),
  };
};

export const getImportHistoryById = async (userId: string, importId: string) => {
  const importHistory = await prisma.importHistory.findFirst({
    where: {
      id: importId,
      userId,
    },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          currency: true,
        },
      },
      importedTransactions: {
        include: {
          transaction: {
            select: {
              id: true,
              amount: true,
              description: true,
              date: true,
              categoryId: true,
            },
          },
        },
        orderBy: {
          rowNumber: 'asc',
        },
      },
    },
  });

  if (!importHistory) {
    throw new AppError(ErrorCodes.IMPORT_NOT_FOUND, 404);
  }

  // Resolve categoryIds to CategoryInfo for display
  const categoryIds = importHistory.importedTransactions
    .map((tx) => tx.transaction?.categoryId)
    .filter((id): id is string => id !== null && id !== undefined);

  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  // Enhance transactions with resolved category info
  const enhancedTransactions = importHistory.importedTransactions.map((tx) => ({
    ...tx,
    transaction: tx.transaction
      ? {
        ...tx.transaction,
        category: tx.transaction.categoryId
          ? categoryMap.get(tx.transaction.categoryId) || null
          : null,
      }
      : null,
  }));

  return {
    ...importHistory,
    importedTransactions: enhancedTransactions,
  };
};
