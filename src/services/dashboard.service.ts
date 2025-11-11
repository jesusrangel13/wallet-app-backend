import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getCashFlow = async (userId: string, months: number = 6) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  // Get transactions grouped by month
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      date: true,
      type: true,
      amount: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Group by month and calculate income/expense
  const monthlyData: Record<string, { income: number; expense: number }> = {};

  transactions.forEach((tx) => {
    const monthKey = tx.date.toISOString().slice(0, 7); // YYYY-MM format
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: 0, expense: 0 };
    }

    if (tx.type === 'INCOME') {
      monthlyData[monthKey].income += Number(tx.amount);
    } else if (tx.type === 'EXPENSE') {
      monthlyData[monthKey].expense += Number(tx.amount);
    }
  });

  // Convert to array with month names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const result = Object.entries(monthlyData)
    .map(([monthKey, data]) => {
      const [year, month] = monthKey.split('-');
      return {
        month: monthNames[parseInt(month) - 1],
        year,
        income: data.income,
        expense: data.expense,
      };
    })
    .slice(-months); // Last N months

  return result;
};

export const getExpensesByCategory = async (userId: string) => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const expenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'EXPENSE',
      date: {
        gte: firstDayOfMonth,
        lte: lastDayOfMonth,
      },
    },
    include: {
      category: {
        select: {
          name: true,
          color: true,
        },
      },
    },
  });

  // Group by category
  const categoryData: Record<string, number> = {};
  let totalExpenses = 0;

  expenses.forEach((expense) => {
    const categoryName = expense.category?.name || 'Uncategorized';
    const amount = Number(expense.amount);

    if (!categoryData[categoryName]) {
      categoryData[categoryName] = 0;
    }
    categoryData[categoryName] += amount;
    totalExpenses += amount;
  });

  // Convert to array with percentages
  const result = Object.entries(categoryData).map(([category, amount]) => ({
    category,
    amount,
    percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
  }));

  return result;
};

export const getBalanceHistory = async (userId: string, days: number = 30) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get all transactions in the period
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        lte: endDate,
      },
    },
    select: {
      date: true,
      type: true,
      amount: true,
      accountId: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // Get initial balance (before start date)
  const initialTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        lt: startDate,
      },
    },
    select: {
      type: true,
      amount: true,
    },
  });

  let initialBalance = 0;
  initialTransactions.forEach((tx) => {
    if (tx.type === 'INCOME') {
      initialBalance += Number(tx.amount);
    } else if (tx.type === 'EXPENSE') {
      initialBalance -= Number(tx.amount);
    }
  });

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

  // Generate data for each day in the range
  for (let i = 0; i < days; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + i);
    const dayKey = currentDate.toISOString().slice(0, 10);

    // Apply transactions for this day
    if (transactionsByDay[dayKey]) {
      transactionsByDay[dayKey].forEach((tx) => {
        if (tx.type === 'INCOME') {
          currentBalance += Number(tx.amount);
        } else if (tx.type === 'EXPENSE') {
          currentBalance -= Number(tx.amount);
        }
      });
    }

    // Only add points every 5 days to keep chart clean
    if (i % 5 === 0 || i === days - 1) {
      dailyBalances.push({
        date: `Day ${i + 1}`,
        balance: Math.round(currentBalance),
      });
    }
  }

  return dailyBalances;
};

export const getGroupBalances = async (userId: string) => {
  // Get all groups where the user is a member
  const groupMembers = await prisma.groupMember.findMany({
    where: {
      userId: userId,
    },
    select: {
      groupId: true,
    },
  });

  const groupIds = groupMembers.map((gm) => gm.groupId);

  // Calculate balances for each group
  const groupBalances = await Promise.all(
    groupIds.map(async (groupId) => {
      // Get group details
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: {
          id: true,
          name: true,
        },
      });

      if (!group) return null;

      // Get all group members
      const members = await prisma.groupMember.findMany({
        where: {
          groupId: groupId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Get all shared expenses in this group
      const sharedExpenses = await prisma.sharedExpense.findMany({
        where: {
          groupId: groupId,
        },
        include: {
          participants: true,
        },
      });

      // Calculate balance for each member
      const memberBalances: Record<string, number> = {};

      // Initialize all members with 0 balance
      members.forEach((member) => {
        memberBalances[member.user.id] = 0;
      });

      // Calculate who owes whom
      sharedExpenses.forEach((expense) => {
        const paidBy = expense.paidByUserId;
        const totalAmount = Number(expense.amount);

        expense.participants.forEach((participant) => {
          const amountOwed = Number(participant.amountOwed);

          if (participant.userId === paidBy) {
            // This person paid, so others owe them
            // Their balance increases by what others owe them
            memberBalances[participant.userId] += totalAmount - amountOwed;
          } else {
            // This person didn't pay, so they owe the payer
            // Their balance decreases by what they owe
            memberBalances[participant.userId] -= amountOwed;
          }
        });
      });

      // Calculate total owed TO the current user (positive balances of others = they owe me)
      const totalOwed = Object.entries(memberBalances)
        .filter(([memberId]) => memberId !== userId)
        .reduce((sum, [, balance]) => sum + (balance < 0 ? Math.abs(balance) : 0), 0);

      return {
        groupId: group.id,
        groupName: group.name,
        totalOwed,
        members: members
          .filter((member) => member.user.id !== userId)
          .map((member) => ({
            userId: member.user.id,
            name: member.user.name,
            email: member.user.email,
            balance: memberBalances[member.user.id] || 0,
          })),
      };
    })
  );

  // Filter out null and groups with no balances
  return groupBalances.filter((group): group is NonNullable<typeof group> =>
    group !== null && (group.totalOwed > 0 || group.members.some((m) => m.balance !== 0))
  );
};

export const getAccountBalances = async (userId: string) => {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      name: true,
      type: true,
      balance: true,
      currency: true,
      creditLimit: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  // Color mapping based on account type
  const accountTypeColors: Record<string, string> = {
    CASH: '#10b981',
    DEBIT: '#3b82f6',
    CREDIT: '#f59e0b',
    SAVINGS: '#8b5cf6',
    INVESTMENT: '#ec4899',
  };

  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: Number(account.balance),
    currency: account.currency,
    creditLimit: account.creditLimit ? Number(account.creditLimit) : null,
    color: accountTypeColors[account.type] || '#3b82f6',
  }));
};
