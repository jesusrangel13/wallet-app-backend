import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import * as notificationService from './notification.service';
import { updateMonthlySummary } from './summary.service';
import { PaginationParams, calculatePagination, calculateSkip } from '../@types/pagination.types';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { calculateSplit } from './expenseSplitCalculator.service';
import {
  fetchSettlementUsers,
  determineSettlementAccounts,
  verifySettlementAccounts,
  fetchDebtCategories,
} from './sharedExpenseSettlement.service';

interface ParticipantData {
  userId: string;
  amountOwed?: number;
  percentage?: number;
  shares?: number;
}

interface CreateSharedExpenseData {
  groupId: string;
  paidByUserId?: string; // Optional: if provided, use this instead of authenticated user
  amount: number;
  description: string;
  categoryId?: string;
  receiptUrl?: string;
  date?: string; // Optional: date of the expense (defaults to now if not provided)
  splitType: 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'SHARES';
  participants?: ParticipantData[];
}

export const createSharedExpense = async (
  userId: string,
  data: CreateSharedExpenseData
) => {
  // Verify user is a member of the group
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId: data.groupId,
      userId,
    },
  });

  if (!membership) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_MEMBER, 403);
  }

  // If participants are not provided, use Group Default Settings
  let finalParticipants = data.participants;
  let finalSplitType = data.splitType;

  if (!finalParticipants || finalParticipants.length === 0) {
    // Fetch group details with default settings
    const groupDefaults = await prisma.group.findUnique({
      where: { id: data.groupId },
      select: {
        defaultSplitType: true,
        defaultSplitSettings: true,
        members: { select: { userId: true } }
      }
    });

    if (groupDefaults) {
      // Use group default split type if available, otherwise keep EQUAL default from request/schema
      if (groupDefaults.defaultSplitType) {
        finalSplitType = groupDefaults.defaultSplitType;
      }

      // Map members to participants with default values
      finalParticipants = groupDefaults.members.map(member => {
        const settings = groupDefaults.defaultSplitSettings.find(s => s.userId === member.userId);
        return {
          userId: member.userId,
          percentage: settings?.percentage ? Number(settings.percentage) : undefined,
          shares: settings?.shares || undefined,
          // amountOwed/exactAmount is usually per-transaction, but could be defaulted if constant?
          // For now, only percentage/shares make sense as comprehensive defaults.
        };
      });
    } else {
      // Fallback if group not found (shouldn't happen given prior checks)
      const allMembers = await prisma.groupMember.findMany({
        where: { groupId: data.groupId },
        select: { userId: true }
      });
      finalParticipants = allMembers.map(m => ({ userId: m.userId }));
    }
  }

  // Verify all participants are members
  const participantIds = finalParticipants.map((p) => p.userId);
  const members = await prisma.groupMember.findMany({
    where: {
      groupId: data.groupId,
      userId: { in: participantIds },
    },
  });

  if (members.length !== participantIds.length) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_PARTICIPANTS_NOT_MEMBERS, 400);
  }

  // Calculate amounts based on split type using extracted service
  const participantsWithAmounts = calculateSplit(
    data.amount,
    finalSplitType,
    finalParticipants
  );

  // Get group for notifications
  const group = await prisma.group.findUnique({
    where: { id: data.groupId },
    select: { name: true },
  });

  // DEBUG: Log para verificar quién está pagando
  const finalPaidByUserId = data.paidByUserId || userId;
  logger.debug('CREATE SHARED EXPENSE - DEBUG INFO', {
    authenticatedUserId: userId,
    authenticatedUserIdLength: userId.length,
    authenticatedUserIdType: typeof userId,
    providedPaidByUserId: data.paidByUserId,
    providedPaidByUserIdLength: data.paidByUserId ? data.paidByUserId.length : 0,
    providedPaidByUserIdType: typeof data.paidByUserId,
    finalPaidByUserId,
    finalPaidByUserIdLength: finalPaidByUserId.length,
    finalPaidByUserIdType: typeof finalPaidByUserId,
    groupId: data.groupId,
    amount: data.amount,
  });

  // Create expense with participants
  // Mark the person who paid as already paid (isPaid = true)
  const participantsWithPaymentStatus = participantsWithAmounts.map((p) => ({
    ...p,
    isPaid: p.userId === finalPaidByUserId,
    paidDate: p.userId === finalPaidByUserId ? new Date() : null,
    paidAmount: p.userId === finalPaidByUserId ? p.amountOwed : null,
  }));

  const expense = await prisma.sharedExpense.create({
    data: {
      groupId: data.groupId,
      paidByUserId: finalPaidByUserId, // Use provided paidByUserId or fallback to authenticated user
      amount: data.amount,
      description: data.description,
      categoryId: data.categoryId,
      receiptUrl: data.receiptUrl,
      date: data.date ? new Date(data.date) : undefined, // Use provided date or default to now
      splitType: finalSplitType,
      participants: {
        create: participantsWithPaymentStatus,
      },
    },
    include: {
      paidBy: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  // Create notifications for participants (except who paid)
  const notificationPromises = expense.participants
    .filter((participant) => participant.userId !== userId)
    .map((participant) =>
      notificationService.createNotification({
        userId: participant.userId,
        type: 'SHARED_EXPENSE_CREATED',
        title: 'Nuevo gasto compartido',
        message: `${expense.paidBy.name} agregó un gasto de $${expense.amount.toFixed(0)} en ${group?.name || 'el grupo'}`,
        data: {
          expenseId: expense.id,
          groupId: expense.groupId,
          amount: expense.amount,
          description: expense.description,
        },
      })
    );

  await Promise.all(notificationPromises);



  // Update monthly summaries for all participants and the payer
  const updatePromises = expense.participants.map(p => updateMonthlySummary(p.userId, expense.date));
  // Payer might not be in participants list (though logic suggests they usually aren't as "participant" unless split logic adds them. My summary logic calculates income/expense. Payer gets nothing changed unless they are partially liable?)
  // Wait, sharedExpense logic: PaidBy pays 100. Participates 50.
  // Payer needs update? Yes, because "Personal Expense" logic checks if transaction is linked to shared expense.
  // If we create a shared expense, we link the transaction?
  // NO. createSharedExpense does NOT create a Transaction record automatically here?
  // Let's check `createSharedExpense`. It creates `SharedExpense`.
  // Does it create a `Transaction`?
  // No, it does NOT seem to create a Transaction in `sharedExpense.service.ts`.
  // The user usually creates a Transaction manually OR the UI does it?
  // Use case: I paid $100. I create a Shared Expense.
  // Ideally, I should also have a Transaction record for that $100.
  // If the backend doesn't create it, then `updateMonthlySummary` only sees the `SharedExpense`.
  // My `updateMonthlySummary` logic:
  // PersonalExpense: from `Transaction` table.
  // SharedExpense: from `ExpenseParticipant`.
  // IMPORTANT: If `SharedExpense` exists but NO `Transaction`, then:
  // Payer: Income 0. Expense 0 (personal). Shared Portion (if participant) X.
  // The $100 outflow is MISSING from "Cash Flow" or "Total Expense" if there is no Transaction!
  // This seems to be a gap in the system logic or I assume Transaction exists.
  // IF Transaction exists (created separately), then we need to update summary when SharedExpense changes because:
  // 1. Participant amountOwed changes.
  // 2. If we link Transaction later?
  // Assuming simpler case: SharedExpense affects Participants.
  // I will update all `participants` found in the expense.
  // And `paidByUserId`.
  if (expense.paidByUserId) updatePromises.push(updateMonthlySummary(expense.paidByUserId, expense.date));
  await Promise.all(updatePromises);

  return expense;
};

interface UpdateSharedExpenseData {
  amount?: number;
  description?: string;
  categoryId?: string;
  receiptUrl?: string;
  date?: string; // Optional: date of the expense
  splitType?: 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'SHARES';
  participants?: ParticipantData[];
  paidByUserId?: string;
}

export const updateSharedExpense = async (
  userId: string,
  expenseId: string,
  data: UpdateSharedExpenseData
) => {
  // Get the expense first
  const expense = await prisma.sharedExpense.findFirst({
    where: {
      id: expenseId,
      group: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      participants: true,
      group: true,
    },
  });

  if (!expense) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_FOUND, 404);
  }

  // Only the person who paid can update the expense
  if (expense.paidByUserId !== userId) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_ONLY_PAYER_CAN_UPDATE, 403);
  }

  // If participants are being updated, verify all are members
  if (data.participants) {
    const participantIds = data.participants.map((p) => p.userId);
    const members = await prisma.groupMember.findMany({
      where: {
        groupId: expense.groupId,
        userId: { in: participantIds },
      },
    });

    if (members.length !== participantIds.length) {
      throw new AppError(ErrorCodes.SHARED_EXPENSE_PARTICIPANTS_NOT_MEMBERS, 400);
    }
  }

  // Determine final values (use new values if provided, otherwise keep existing)
  const finalAmount = data.amount !== undefined ? data.amount : Number(expense.amount);
  const finalSplitType = data.splitType || expense.splitType;
  const finalParticipants = data.participants || expense.participants.map(p => ({
    userId: p.userId,
    amountOwed: Number(p.amountOwed),
    percentage: undefined,
    shares: undefined,
  }));

  // Calculate amounts based on split type using extracted service
  const participantsWithAmounts = calculateSplit(
    finalAmount,
    finalSplitType,
    finalParticipants
  );

  // Update expense and participants in a transaction
  const updatedExpense = await prisma.$transaction(async (tx) => {
    // Delete existing participants
    await tx.expenseParticipant.deleteMany({
      where: { expenseId },
    });

    // Determine who is paying (could be updated)
    const finalPaidByUserId = data.paidByUserId || expense.paidByUserId;

    // Mark the person who paid as already paid (isPaid = true)
    const participantsWithPaymentStatus = participantsWithAmounts.map((p) => ({
      ...p,
      isPaid: p.userId === finalPaidByUserId,
      paidDate: p.userId === finalPaidByUserId ? new Date() : null,
      paidAmount: p.userId === finalPaidByUserId ? p.amountOwed : null,
    }));

    // Update expense with new data
    const updated = await tx.sharedExpense.update({
      where: { id: expenseId },
      data: {
        amount: finalAmount,
        description: data.description !== undefined ? data.description : expense.description,
        categoryId: data.categoryId !== undefined ? data.categoryId : expense.categoryId,
        receiptUrl: data.receiptUrl !== undefined ? data.receiptUrl : expense.receiptUrl,
        date: data.date ? new Date(data.date) : undefined,
        splitType: finalSplitType,
        paidByUserId: finalPaidByUserId,
        participants: {
          create: participantsWithPaymentStatus,
        },
      },
      include: {
        paidBy: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return updated;
  });

  // Create notifications for participants about the update
  const notificationPromises = updatedExpense.participants
    .filter((participant) => participant.userId !== userId)
    .map((participant) =>
      notificationService.createNotification({
        userId: participant.userId,
        type: 'SHARED_EXPENSE_CREATED',
        title: 'Gasto compartido actualizado',
        message: `${updatedExpense.paidBy.name} actualizó el gasto "${updatedExpense.description}" en ${updatedExpense.group.name}`,
        data: {
          expenseId: updatedExpense.id,
          groupId: updatedExpense.groupId,
          amount: updatedExpense.amount,
          description: updatedExpense.description,
        },
      })
    );

  await Promise.all(notificationPromises);

  await Promise.all(notificationPromises);

  // Update monthly summaries
  const updatePromises = updatedExpense.participants.map(p => updateMonthlySummary(p.userId, updatedExpense.date));
  updatePromises.push(updateMonthlySummary(updatedExpense.paidByUserId, updatedExpense.date));
  // Also update for OLD participants if any were removed?
  // That's tricky. But `updateMonthlySummary` recalculates whole month.
  // So if I update the month for the OLD date (if date changed) and NEW date.
  // Logic here assumes date didn't change wildly.
  // If participants were removed, we need to update THEIR summary too.
  // But `updatedExpense.participants` only has CURRENT participants.
  // I should have captured old participants?
  // The code deletes existing participants (line 303).
  // Ideally I should fetch old expense, get participants, and update them too.
  // Existing code: `const expense = await prisma.sharedExpense.findFirst(...)`.
  // I can use `expense.participants` from the top of the function.
  // So:
  const allUserIds = new Set<string>();
  expense.participants.forEach(p => allUserIds.add(p.userId));
  updatedExpense.participants.forEach(p => allUserIds.add(p.userId));
  allUserIds.add(updatedExpense.paidByUserId);
  allUserIds.add(expense.paidByUserId);

  const uniqueUserIds = Array.from(allUserIds);
  await Promise.all(uniqueUserIds.map(uid => updateMonthlySummary(uid, updatedExpense.date)));
  // Note: if date changed, we should also update old date.
  if (expense.date.getTime() !== updatedExpense.date.getTime()) {
    await Promise.all(uniqueUserIds.map(uid => updateMonthlySummary(uid, expense.date)));
  }

  return updatedExpense;
};

export const getSharedExpenses = async (
  userId: string,
  groupId?: string,
  pagination?: PaginationParams
) => {
  const where: any = {
    group: {
      members: {
        some: {
          userId,
        },
      },
    },
  };

  if (groupId) {
    where.groupId = groupId;
  }

  // Pagination parameters
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 50, 200); // Max 200 per page
  const skip = calculateSkip(page, limit);

  // Get total count for pagination metadata
  const total = await prisma.sharedExpense.count({ where });

  // Get paginated expenses
  const expenses = await prisma.sharedExpense.findMany({
    where,
    include: {
      group: {
        select: {
          id: true,
          name: true,
        },
      },
      paidBy: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });

  return {
    data: expenses,
    pagination: calculatePagination(page, limit, total),
  };
};

export const getSharedExpenseById = async (userId: string, expenseId: string) => {
  const expense = await prisma.sharedExpense.findFirst({
    where: {
      id: expenseId,
      group: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      group: {
        select: {
          id: true,
          name: true,
        },
      },
      paidBy: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  if (!expense) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_FOUND, 404);
  }

  return expense;
};

export const deleteSharedExpense = async (userId: string, expenseId: string) => {
  const expense = await prisma.sharedExpense.findFirst({
    where: {
      id: expenseId,
      paidByUserId: userId,
    },
  });

  if (!expense) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_ONLY_PAYER_CAN_DELETE, 403);
  }

  await prisma.sharedExpense.delete({
    where: { id: expenseId },
  });

  return { message: 'Expense deleted successfully' };
};

export const settlePayment = async (
  userId: string,
  toUserId: string,
  amount: number,
  groupId?: string
) => {
  // Verify both users exist
  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.user.findUnique({ where: { id: toUserId } }),
  ]);

  if (!fromUser || !toUser) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND, 404);
  }

  // If groupId is provided, verify both are members
  if (groupId) {
    const [fromMembership, toMembership] = await Promise.all([
      prisma.groupMember.findFirst({
        where: { groupId, userId },
      }),
      prisma.groupMember.findFirst({
        where: { groupId, userId: toUserId },
      }),
    ]);

    if (!fromMembership || !toMembership) {
      throw new AppError(ErrorCodes.SHARED_EXPENSE_USERS_NOT_IN_GROUP, 400);
    }
  }

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      fromUserId: userId,
      toUserId,
      amount,
      groupId,
    },
    include: {
      from: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      to: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  return payment;
};

export const getPaymentHistory = async (
  userId: string,
  groupId?: string,
  pagination?: PaginationParams
) => {
  const where: any = {
    OR: [{ fromUserId: userId }, { toUserId: userId }],
  };

  if (groupId) {
    where.groupId = groupId;
  }

  // Pagination parameters
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 50, 200); // Max 200 per page
  const skip = calculateSkip(page, limit);

  // Get total count for pagination metadata
  const total = await prisma.payment.count({ where });

  // Get paginated payments
  const payments = await prisma.payment.findMany({
    where,
    include: {
      from: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      to: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
      group: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: limit,
  });

  return {
    data: payments,
    pagination: calculatePagination(page, limit, total),
  };
};

export const calculateSimplifiedDebts = async (userId: string, groupId: string) => {
  // Verify user is a member
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });

  if (!membership) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_MEMBER, 403);
  }

  // Get all group members
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
  });

  // Calculate net balance for each member
  const balances: Record<string, number> = {};
  members.forEach((member) => {
    balances[member.userId] = 0;
  });

  // Add expenses
  const expenses = await prisma.sharedExpense.findMany({
    where: { groupId },
    include: {
      participants: true,
    },
  });

  expenses.forEach((expense) => {
    // Only count unpaid participants to avoid counting already-paid expenses
    let unpaidTotal = 0;
    expense.participants.forEach((participant) => {
      if (!participant.isPaid) {
        balances[participant.userId] -= Number(participant.amountOwed);
        unpaidTotal += Number(participant.amountOwed);
      }
    });

    // Only add to payer's balance if there are unpaid amounts
    if (unpaidTotal > 0) {
      balances[expense.paidByUserId] += unpaidTotal;
    }
  });

  // Simplify debts using greedy algorithm
  const creditors = Object.entries(balances)
    .filter(([_, balance]) => balance > 0.01)
    .sort(([_, a], [__, b]) => b - a);

  const debtors = Object.entries(balances)
    .filter(([_, balance]) => balance < -0.01)
    .sort(([_, a], [__, b]) => a - b);

  const simplifiedDebts: Array<{
    from: { id: string; name: string };
    to: { id: string; name: string };
    amount: number;
  }> = [];

  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const [creditorId, creditAmount] = creditors[i];
    const [debtorId, debtAmount] = debtors[j];

    const amount = Math.min(creditAmount, Math.abs(debtAmount));

    const creditor = members.find((m) => m.userId === creditorId)!;
    const debtor = members.find((m) => m.userId === debtorId)!;

    simplifiedDebts.push({
      from: { id: debtor.userId, name: debtor.user.name },
      to: { id: creditor.userId, name: creditor.user.name },
      amount,
    });

    creditors[i][1] -= amount;
    debtors[j][1] += amount;

    if (creditors[i][1] < 0.01) i++;
    if (Math.abs(debtors[j][1]) < 0.01) j++;
  }

  return simplifiedDebts;
};

// Mark a participant as paid for a specific expense
export const markParticipantAsPaid = async (
  userId: string,
  expenseId: string,
  participantUserId: string,
  accountId?: string
) => {
  // Get the expense
  const expense = await prisma.sharedExpense.findFirst({
    where: {
      id: expenseId,
      group: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      participants: true,
    },
  });

  if (!expense) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_FOUND, 404);
  }

  // Only the person who paid or the person who owes can mark as paid
  const isPayee = expense.paidByUserId === userId;
  const isDebtor = participantUserId === userId;

  if (!isPayee && !isDebtor) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_INVALID_PAYMENT_PERMISSION, 403);
  }

  // Find the participant
  const participant = expense.participants.find(
    (p) => p.userId === participantUserId
  );

  if (!participant) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_PARTICIPANT_NOT_FOUND, 404);
  }

  // Update participant payment status
  const updatedParticipant = await prisma.expenseParticipant.update({
    where: {
      id: participant.id,
    },
    data: {
      isPaid: true,
      paidDate: new Date(),
      paidAmount: participant.amountOwed,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  // Notify the person who originally paid the expense
  if (expense.paidByUserId !== participantUserId) {
    await notificationService.createNotification({
      userId: expense.paidByUserId,
      type: 'PAYMENT_RECEIVED',
      title: 'Pago recibido',
      message: `${updatedParticipant.user.name} te pagó $${participant.amountOwed.toFixed(0)} del gasto "${expense.description}"`,
      data: {
        expenseId: expense.id,
        participantId: participant.id,
        amount: participant.amountOwed,
        paidBy: updatedParticipant.user.name,
      },
    });
  }

  // Create transactions in both users' accounts if configured
  let transactionsCreated = false;

  // Determine roles: debtor is the participant, payee is who paid originally
  const debtorUserId = participantUserId;
  const payeeUserId = expense.paidByUserId;

  // Fetch both users with their default accounts using extracted service
  const users = await fetchSettlementUsers(debtorUserId, payeeUserId);

  // Determine which account IDs to use based on who initiated the payment
  const { debtorAccountId, payeeAccountId } = determineSettlementAccounts(
    userId,
    debtorUserId,
    accountId,
    users
  );

  // Only create transactions if both accounts are configured
  if (debtorAccountId && payeeAccountId) {
    // Verify accounts exist and are active using extracted service
    const accounts = await verifySettlementAccounts(
      debtorAccountId,
      debtorUserId,
      payeeAccountId,
      payeeUserId
    );

    if (accounts) {
      // Fetch the debt payment categories using extracted service
      const categories = await fetchDebtCategories();

      const transactionService = await import('./transaction.service');
      const amount = Number(participant.amountOwed);

      // Create transactions: EXPENSE for debtor, INCOME for payee
      await Promise.all([
        // Create EXPENSE transaction for the debtor
        transactionService.createTransaction(debtorUserId, {
          amount,
          type: 'EXPENSE',
          accountId: debtorAccountId,
          categoryId: categories.debtPaymentCategoryId,
          description: `Pago a ${users.payee?.name} por "${expense.description}"`,
          date: new Date().toISOString(),
          sharedExpenseId: expenseId,
          tags: [],
        }),
        // Create INCOME transaction for the payee
        transactionService.createTransaction(payeeUserId, {
          amount,
          type: 'INCOME',
          accountId: payeeAccountId,
          categoryId: categories.debtCollectionCategoryId,
          description: `Recibido de ${users.debtor?.name} por "${expense.description}"`,
          date: new Date().toISOString(),
          sharedExpenseId: expenseId,
          tags: [],
        }),
      ]);
      transactionsCreated = true;
    }
  }

  return {
    participant: updatedParticipant,
    transactionsCreated,
  };
};

// Mark a participant as unpaid (to undo a payment)
export const markParticipantAsUnpaid = async (
  userId: string,
  expenseId: string,
  participantUserId: string
) => {
  // Get the expense
  const expense = await prisma.sharedExpense.findFirst({
    where: {
      id: expenseId,
      group: {
        members: {
          some: {
            userId,
          },
        },
      },
    },
    include: {
      participants: true,
    },
  });

  if (!expense) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NOT_FOUND, 404);
  }

  // Only the person who paid can mark as unpaid
  if (expense.paidByUserId !== userId) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_ONLY_PAYER_CAN_UNDO, 403);
  }

  // Find the participant
  const participant = expense.participants.find(
    (p) => p.userId === participantUserId
  );

  if (!participant) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_PARTICIPANT_NOT_FOUND, 404);
  }

  // Update participant payment status
  const updatedParticipant = await prisma.expenseParticipant.update({
    where: {
      id: participant.id,
    },
    data: {
      isPaid: false,
      paidDate: null,
      paidAmount: null,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });

  return updatedParticipant;
};

// Settle all balances between two users in a group
export const settleAllBalance = async (
  userId: string,
  groupId: string,
  otherUserId: string,
  accountId?: string // Optional account ID from user who initiates payment
) => {
  // Verify both users are members of the group
  const [membership1, membership2] = await Promise.all([
    prisma.groupMember.findFirst({
      where: { groupId, userId },
    }),
    prisma.groupMember.findFirst({
      where: { groupId, userId: otherUserId },
    }),
  ]);

  if (!membership1 || !membership2) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_USERS_NOT_IN_GROUP, 403);
  }

  // Calculate current balances
  const debts = await calculateSimplifiedDebts(userId, groupId);

  // Find debt between these two users
  const debtBetweenUsers = debts.find(
    (debt) =>
      (debt.from.id === userId && debt.to.id === otherUserId) ||
      (debt.from.id === otherUserId && debt.to.id === userId)
  );

  if (!debtBetweenUsers) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_NO_BALANCE, 400);
  }

  // Get all unpaid expenses between these users
  const expenses = await prisma.sharedExpense.findMany({
    where: {
      groupId,
      OR: [
        {
          paidByUserId: userId,
          participants: {
            some: {
              userId: otherUserId,
              isPaid: false,
            },
          },
        },
        {
          paidByUserId: otherUserId,
          participants: {
            some: {
              userId,
              isPaid: false,
            },
          },
        },
      ],
    },
    include: {
      participants: true,
    },
  });

  // Mark all participants as paid
  logger.debug('DEBUG settleAllBalance - Found expenses', { expensesCount: expenses.length });

  const updatePromises = expenses.flatMap((expense) =>
    expense.participants
      .filter(
        (p) =>
          !p.isPaid &&
          ((expense.paidByUserId === userId && p.userId === otherUserId) ||
            (expense.paidByUserId === otherUserId && p.userId === userId))
      )
      .map((p) => {
        logger.debug('DEBUG settleAllBalance - Marking participant as paid', {
          participantId: p.id,
          expenseId: expense.id,
        });
        return prisma.expenseParticipant.update({
          where: { id: p.id },
          data: {
            isPaid: true,
            paidDate: new Date(),
            paidAmount: p.amountOwed,
          },
        });
      })
  );

  logger.debug('DEBUG settleAllBalance - Update promises', { promisesCount: updatePromises.length });
  const updatedParticipants = await Promise.all(updatePromises);
  logger.debug('DEBUG settleAllBalance - Updated participants', { participantsCount: updatedParticipants.length });

  // Verify the updates by querying the database
  const verifyParticipants = await prisma.expenseParticipant.findMany({
    where: {
      id: {
        in: updatedParticipants.map(p => p.id)
      }
    },
    select: {
      id: true,
      userId: true,
      isPaid: true,
      paidDate: true,
      expenseId: true,
    }
  });
  logger.debug('DEBUG settleAllBalance - Verification from DB', { verifyParticipants });

  // Transaction creation logic
  let transactionsCreated = false;

  // Fetch both users with their default accounts
  const [initiatorUser, otherUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        defaultSharedExpenseAccountId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: otherUserId },
      select: {
        id: true,
        name: true,
        defaultSharedExpenseAccountId: true,
      },
    }),
  ]);

  // Determine which account to use for the initiator
  const initiatorAccountId = accountId || initiatorUser?.defaultSharedExpenseAccountId;
  const otherUserAccountId = otherUser?.defaultSharedExpenseAccountId;

  // Create transactions if both accounts are configured
  if (initiatorAccountId && otherUserAccountId) {
    // Verify both accounts exist and are not archived
    const [initiatorAccount, otherAccount] = await Promise.all([
      prisma.account.findFirst({
        where: {
          id: initiatorAccountId,
          userId,
          isArchived: false,
        },
      }),
      prisma.account.findFirst({
        where: {
          id: otherUserAccountId,
          userId: otherUserId,
          isArchived: false,
        },
      }),
    ]);

    if (initiatorAccount && otherAccount) {
      // Determine who pays whom based on debt direction
      const isPayer = debtBetweenUsers.from.id === userId;

      // Find the debt payment categories using extracted service
      const categories = await fetchDebtCategories();

      // Import transaction service at the top of the file if not already imported
      const transactionService = await import('./transaction.service');

      if (isPayer) {
        // Initiator pays, so create EXPENSE for initiator and INCOME for other user
        await Promise.all([
          // Expense transaction for the payer (initiator)
          transactionService.createTransaction(userId, {
            amount: debtBetweenUsers.amount,
            type: 'EXPENSE',
            accountId: initiatorAccountId,
            categoryId: categories.debtPaymentCategoryId,
            description: `Pago de balance compartido a ${otherUser?.name}.`,
            date: new Date().toISOString(),
            sharedExpenseId: expenses.length > 0 ? expenses[0].id : undefined,
            tags: [],
          }),
          // Income transaction for the receiver (other user)
          transactionService.createTransaction(otherUserId, {
            amount: debtBetweenUsers.amount,
            type: 'INCOME',
            accountId: otherUserAccountId,
            categoryId: categories.debtCollectionCategoryId,
            description: `Recibido de ${initiatorUser?.name} por balance compartido.`,
            date: new Date().toISOString(),
            sharedExpenseId: expenses.length > 0 ? expenses[0].id : undefined,
            tags: [],
          }),
        ]);
        transactionsCreated = true;
      } else {
        // Other user pays, so create INCOME for initiator and EXPENSE for other user
        await Promise.all([
          // Income transaction for the receiver (initiator)
          transactionService.createTransaction(userId, {
            amount: debtBetweenUsers.amount,
            type: 'INCOME',
            accountId: initiatorAccountId,
            categoryId: categories.debtCollectionCategoryId,
            description: `Recibido de ${otherUser?.name} por balance compartido.`,
            date: new Date().toISOString(),
            sharedExpenseId: expenses.length > 0 ? expenses[0].id : undefined,
            tags: [],
          }),
          // Expense transaction for the payer (other user)
          transactionService.createTransaction(otherUserId, {
            amount: debtBetweenUsers.amount,
            type: 'EXPENSE',
            accountId: otherUserAccountId,
            categoryId: categories.debtPaymentCategoryId,
            description: `Pago de balance compartido a ${initiatorUser?.name}.`,
            date: new Date().toISOString(),
            sharedExpenseId: expenses.length > 0 ? expenses[0].id : undefined,
            tags: [],
          }),
        ]);
        transactionsCreated = true;
      }
    }
  }

  // Create a settlement payment record
  const payment = await settlePayment(
    debtBetweenUsers.from.id,
    debtBetweenUsers.to.id,
    debtBetweenUsers.amount,
    groupId
  );

  // Get user names for notifications
  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: debtBetweenUsers.from.id },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: debtBetweenUsers.to.id },
      select: { name: true },
    }),
  ]);

  // Create notifications for both users
  await Promise.all([
    // Notify the person who received payment
    notificationService.createNotification({
      userId: debtBetweenUsers.to.id,
      type: 'BALANCE_SETTLED',
      title: 'Balance saldado',
      message: `${fromUser?.name} saldó todos los balances contigo ($${debtBetweenUsers.amount.toFixed(0)} en ${expenses.length} gasto(s))`,
      data: {
        groupId,
        fromUserId: debtBetweenUsers.from.id,
        amount: debtBetweenUsers.amount,
        settledExpenses: expenses.length,
      },
    }),
    // Notify the person who paid
    notificationService.createNotification({
      userId: debtBetweenUsers.from.id,
      type: 'BALANCE_SETTLED',
      title: 'Balance saldado',
      message: `Saldaste todos los balances con ${toUser?.name} ($${debtBetweenUsers.amount.toFixed(0)} en ${expenses.length} gasto(s))`,
      data: {
        groupId,
        toUserId: debtBetweenUsers.to.id,
        amount: debtBetweenUsers.amount,
        settledExpenses: expenses.length,
      },
    }),
  ]);

  return {
    payment,
    settledExpenses: expenses.length,
    amount: debtBetweenUsers.amount,
    transactionsCreated,
  };
};

// Get user's balances across all groups
export const getUserBalances = async (userId: string, month?: number, year?: number) => {
  // Get all groups the user is a member of
  const groups = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          coverImageUrl: true,
        },
      },
    },
  });

  // Calculate balances for each group
  const balancePromises = groups.map(async (membership) => {
    const groupId = membership.groupId;

    // Build where clause with optional date filter
    const whereClause: any = { groupId };

    if (month !== undefined && year !== undefined) {
      // Filter expenses by month and year
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);

      whereClause.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    // Get all expenses in this group
    const expenses = await prisma.sharedExpense.findMany({
      where: whereClause,
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        paidBy: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Calculate what others owe this user
    let othersOweMe = 0;
    const peopleWhoOweMe: Record<string, { amount: number; totalHistorical: number; totalPaid: number; user: any; unpaidExpenses: any[]; paidExpenses: any[] }> = {};

    expenses.forEach((expense) => {
      if (expense.paidByUserId === userId) {
        expense.participants.forEach((participant) => {
          if (participant.userId !== userId) {
            // Initialize person if not exists
            if (!peopleWhoOweMe[participant.userId]) {
              peopleWhoOweMe[participant.userId] = {
                amount: 0,
                totalHistorical: 0,
                totalPaid: 0,
                user: participant.user,
                unpaidExpenses: [],
                paidExpenses: [],
              };
            }

            const amountOwed = Number(participant.amountOwed);

            if (!participant.isPaid) {
              // Unpaid expense
              othersOweMe += amountOwed;
              peopleWhoOweMe[participant.userId].amount += amountOwed;
              peopleWhoOweMe[participant.userId].unpaidExpenses.push({
                expenseId: expense.id,
                description: expense.description,
                amount: amountOwed,
                date: expense.date,
              });
            } else {
              // Paid expense
              peopleWhoOweMe[participant.userId].totalPaid += amountOwed;
              peopleWhoOweMe[participant.userId].paidExpenses.push({
                expenseId: expense.id,
                description: expense.description,
                amount: amountOwed,
                date: expense.date,
                paidDate: participant.paidDate,
              });
            }

            // Add to historical total
            peopleWhoOweMe[participant.userId].totalHistorical += amountOwed;
          }
        });
      }
    });

    // Calculate what this user owes others
    let iOweOthers = 0;
    const peopleIOweTo: Record<string, { amount: number; totalHistorical: number; totalPaid: number; user: any; unpaidExpenses: any[]; paidExpenses: any[] }> = {};

    expenses.forEach((expense) => {
      const myParticipation = expense.participants.find((p) => p.userId === userId);
      if (myParticipation && expense.paidByUserId !== userId) {
        // Initialize person if not exists
        if (!peopleIOweTo[expense.paidByUserId]) {
          peopleIOweTo[expense.paidByUserId] = {
            amount: 0,
            totalHistorical: 0,
            totalPaid: 0,
            user: expense.paidBy,
            unpaidExpenses: [],
            paidExpenses: [],
          };
        }

        const amountOwed = Number(myParticipation.amountOwed);

        if (!myParticipation.isPaid) {
          // Unpaid expense
          iOweOthers += amountOwed;
          peopleIOweTo[expense.paidByUserId].amount += amountOwed;
          peopleIOweTo[expense.paidByUserId].unpaidExpenses.push({
            expenseId: expense.id,
            description: expense.description,
            amount: amountOwed,
            date: expense.date,
          });
        } else {
          // Paid expense
          peopleIOweTo[expense.paidByUserId].totalPaid += amountOwed;
          peopleIOweTo[expense.paidByUserId].paidExpenses.push({
            expenseId: expense.id,
            description: expense.description,
            amount: amountOwed,
            date: expense.date,
            paidDate: myParticipation.paidDate,
          });
        }

        // Add to historical total
        peopleIOweTo[expense.paidByUserId].totalHistorical += amountOwed;
      }
    });

    // Calculate total shared expenses for the group
    const totalSharedExpenses = expenses.reduce((sum, expense) => {
      return sum + Number(expense.amount);
    }, 0);

    return {
      group: membership.group,
      othersOweMe,
      iOweOthers,
      netBalance: othersOweMe - iOweOthers,
      totalSharedExpenses,
      peopleWhoOweMe: Object.values(peopleWhoOweMe),
      peopleIOweTo: Object.values(peopleIOweTo),
    };
  });

  const balances = await Promise.all(balancePromises);

  // Calculate totals
  const totalOthersOweMe = balances.reduce((sum, b) => sum + b.othersOweMe, 0);
  const totalIOweOthers = balances.reduce((sum, b) => sum + b.iOweOthers, 0);

  return {
    totalOthersOweMe,
    totalIOweOthers,
    netBalance: totalOthersOweMe - totalIOweOthers,
    groupBalances: balances,
  };
};
