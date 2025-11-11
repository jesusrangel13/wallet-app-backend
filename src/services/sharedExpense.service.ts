import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import * as notificationService from './notification.service';

const prisma = new PrismaClient();

interface ParticipantData {
  userId: string;
  amountOwed?: number;
  percentage?: number;
  shares?: number;
}

interface CreateSharedExpenseData {
  groupId: string;
  amount: number;
  description: string;
  categoryId?: string;
  receiptUrl?: string;
  splitType: 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'SHARES';
  participants: ParticipantData[];
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
    throw new AppError('You are not a member of this group', 403);
  }

  // Verify all participants are members
  const participantIds = data.participants.map((p) => p.userId);
  const members = await prisma.groupMember.findMany({
    where: {
      groupId: data.groupId,
      userId: { in: participantIds },
    },
  });

  if (members.length !== participantIds.length) {
    throw new AppError('All participants must be members of the group', 400);
  }

  // Calculate amounts based on split type
  let participantsWithAmounts: Array<{ userId: string; amountOwed: number }> = [];

  if (data.splitType === 'EQUAL') {
    const amountPerPerson = data.amount / data.participants.length;
    participantsWithAmounts = data.participants.map((p) => ({
      userId: p.userId,
      amountOwed: amountPerPerson,
    }));
  } else if (data.splitType === 'PERCENTAGE') {
    const totalPercentage = data.participants.reduce(
      (sum, p) => sum + (p.percentage || 0),
      0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new AppError('Percentages must add up to 100', 400);
    }
    participantsWithAmounts = data.participants.map((p) => ({
      userId: p.userId,
      amountOwed: (data.amount * (p.percentage || 0)) / 100,
    }));
  } else if (data.splitType === 'EXACT') {
    const totalAmount = data.participants.reduce(
      (sum, p) => sum + (p.amountOwed || 0),
      0
    );
    if (Math.abs(totalAmount - data.amount) > 0.01) {
      throw new AppError('Exact amounts must add up to total amount', 400);
    }
    participantsWithAmounts = data.participants.map((p) => ({
      userId: p.userId,
      amountOwed: p.amountOwed || 0,
    }));
  } else if (data.splitType === 'SHARES') {
    const totalShares = data.participants.reduce(
      (sum, p) => sum + (p.shares || 1),
      0
    );
    participantsWithAmounts = data.participants.map((p) => ({
      userId: p.userId,
      amountOwed: (data.amount * (p.shares || 1)) / totalShares,
    }));
  }

  // Get group for notifications
  const group = await prisma.group.findUnique({
    where: { id: data.groupId },
    select: { name: true },
  });

  // Create expense with participants
  const expense = await prisma.sharedExpense.create({
    data: {
      groupId: data.groupId,
      paidByUserId: userId,
      amount: data.amount,
      description: data.description,
      categoryId: data.categoryId,
      receiptUrl: data.receiptUrl,
      splitType: data.splitType,
      participants: {
        create: participantsWithAmounts,
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

  return expense;
};

export const getSharedExpenses = async (userId: string, groupId?: string) => {
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
  });

  return expenses;
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
    throw new AppError('Expense not found or you are not a member', 404);
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
    throw new AppError('Expense not found or you are not the payer', 403);
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
    throw new AppError('User not found', 404);
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
      throw new AppError('Both users must be members of the group', 400);
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

export const getPaymentHistory = async (userId: string, groupId?: string) => {
  const where: any = {
    OR: [{ fromUserId: userId }, { toUserId: userId }],
  };

  if (groupId) {
    where.groupId = groupId;
  }

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
  });

  return payments;
};

export const calculateSimplifiedDebts = async (userId: string, groupId: string) => {
  // Verify user is a member
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });

  if (!membership) {
    throw new AppError('You are not a member of this group', 403);
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
    balances[expense.paidByUserId] += Number(expense.amount);
    expense.participants.forEach((participant) => {
      balances[participant.userId] -= Number(participant.amountOwed);
    });
  });

  // Subtract payments
  const payments = await prisma.payment.findMany({
    where: { groupId },
  });

  payments.forEach((payment) => {
    balances[payment.fromUserId] -= Number(payment.amount);
    balances[payment.toUserId] += Number(payment.amount);
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
    throw new AppError('Expense not found or you are not a member', 404);
  }

  // Only the person who paid or the person who owes can mark as paid
  const isPayee = expense.paidByUserId === userId;
  const isDebtor = participantUserId === userId;

  if (!isPayee && !isDebtor) {
    throw new AppError('You can only mark payments you paid for or payments you owe', 403);
  }

  // Find the participant
  const participant = expense.participants.find(
    (p) => p.userId === participantUserId
  );

  if (!participant) {
    throw new AppError('Participant not found in this expense', 404);
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

  return updatedParticipant;
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
    throw new AppError('Expense not found or you are not a member', 404);
  }

  // Only the person who paid can mark as unpaid
  if (expense.paidByUserId !== userId) {
    throw new AppError('Only the person who paid can undo a payment', 403);
  }

  // Find the participant
  const participant = expense.participants.find(
    (p) => p.userId === participantUserId
  );

  if (!participant) {
    throw new AppError('Participant not found in this expense', 404);
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
  otherUserId: string
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
    throw new AppError('Both users must be members of the group', 403);
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
    throw new AppError('No balance to settle between these users', 400);
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
  const updatePromises = expenses.flatMap((expense) =>
    expense.participants
      .filter(
        (p) =>
          !p.isPaid &&
          ((expense.paidByUserId === userId && p.userId === otherUserId) ||
            (expense.paidByUserId === otherUserId && p.userId === userId))
      )
      .map((p) =>
        prisma.expenseParticipant.update({
          where: { id: p.id },
          data: {
            isPaid: true,
            paidDate: new Date(),
            paidAmount: p.amountOwed,
          },
        })
      )
  );

  await Promise.all(updatePromises);

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
  };
};

// Get user's balances across all groups
export const getUserBalances = async (userId: string) => {
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

    // Get all expenses in this group
    const expenses = await prisma.sharedExpense.findMany({
      where: { groupId },
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

    // Get all payments in this group
    const payments = await prisma.payment.findMany({
      where: { groupId },
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

    return {
      group: membership.group,
      othersOweMe,
      iOweOthers,
      netBalance: othersOweMe - iOweOthers,
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
