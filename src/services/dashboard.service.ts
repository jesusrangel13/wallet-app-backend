import { PrismaClient } from '@prisma/client';
import { resolveCategoriesBatch } from './categoryResolver.service';

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
    select: {
      categoryId: true,
      amount: true,
    },
  });

  // Resolve all categories in batch
  const categoryIds = expenses.map((e) => e.categoryId);
  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  // Group by category
  const categoryData: Record<string, number> = {};
  let totalExpenses = 0;

  expenses.forEach((expense) => {
    const categoryInfo = expense.categoryId ? categoryMap.get(expense.categoryId) : null;
    const categoryName = categoryInfo?.name || 'Uncategorized';
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

export const getExpensesByParentCategory = async (userId: string) => {
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
    select: {
      categoryId: true,
      amount: true,
    },
  });

  // Resolve all categories in batch with parent info
  const categoryIds = expenses.map((e) => e.categoryId);
  const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

  // Group by parent category (or category itself if no parent)
  const categoryData: Record<
    string,
    { amount: number; icon: string | null; color: string | null }
  > = {};
  let totalExpenses = 0;

  expenses.forEach((expense) => {
    const categoryInfo = expense.categoryId ? categoryMap.get(expense.categoryId) : null;

    // Use parent category if exists, otherwise use the category itself
    const parentCategory = categoryInfo?.parent || categoryInfo;
    const categoryName = parentCategory?.name || 'Uncategorized';
    const categoryIcon = parentCategory?.icon || null;
    const categoryColor = parentCategory?.color || null;
    const amount = Number(expense.amount);

    if (!categoryData[categoryName]) {
      categoryData[categoryName] = {
        amount: 0,
        icon: categoryIcon,
        color: categoryColor,
      };
    }
    categoryData[categoryName].amount += amount;
    totalExpenses += amount;
  });

  // Convert to array with percentages, sorted by amount descending
  const result = Object.entries(categoryData)
    .map(([category, data]) => ({
      category,
      amount: data.amount,
      percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
      icon: data.icon,
      color: data.color,
    }))
    .sort((a, b) => b.amount - a.amount);

  return result;
};

export const getBalanceHistory = async (userId: string, days: number = 30) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Optimize: Use database aggregation instead of loading all transactions into memory
  // Get transactions only for the display range
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

  // Calculate initial balance using database aggregation (before start date)
  const initialBalanceData = await prisma.transaction.groupBy({
    by: ['type'],
    where: {
      userId,
      date: {
        lt: startDate,
      },
    },
    _sum: {
      amount: true,
    },
  });

  let initialBalance = 0;
  initialBalanceData.forEach((group) => {
    const sum = group._sum.amount ? Number(group._sum.amount) : 0;
    if (group.type === 'INCOME') {
      initialBalance += sum;
    } else if (group.type === 'EXPENSE') {
      initialBalance -= sum;
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
        date: dayKey, // Return actual date in YYYY-MM-DD format
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

  if (groupIds.length === 0) {
    return [];
  }

  // Optimize: Fetch all data for all groups in parallel instead of N+1 queries
  // Get all groups
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true, coverImageUrl: true },
  });

  // Get all members for all groups
  const allMembers = await prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Get all shared expenses for all groups
  const allExpenses = await prisma.sharedExpense.findMany({
    where: { groupId: { in: groupIds } },
    include: { participants: true },
  });

  // Calculate balances for each group
  const groupBalances = groups.map((group) => {
    // Filter members and expenses for this group
    const members = allMembers.filter((m) => m.groupId === group.id);
    const sharedExpenses = allExpenses.filter((e) => e.groupId === group.id);

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
      groupCoverImage: group.coverImageUrl,
      userBalance: memberBalances[userId] || 0,
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
  });

  // Filter out groups with no balances
  return groupBalances.filter(
    (group) => group.totalOwed > 0 || group.members.some((m) => m.balance !== 0)
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

/**
 * Unified dashboard summary endpoint that returns all widget data in a single request
 * This eliminates the need for multiple API calls to load the dashboard
 */
export const getDashboardSummary = async (userId: string) => {
  try {
    // Fetch all dashboard data in parallel
    const [
      cashFlow,
      expensesByCategory,
      balanceHistory,
      groupBalances,
      accountBalances,
    ] = await Promise.all([
      getCashFlow(userId),
      getExpensesByCategory(userId),
      getBalanceHistory(userId),
      getGroupBalances(userId),
      getAccountBalances(userId),
    ]);

    return {
      cashFlow,
      expensesByCategory,
      balanceHistory,
      groupBalances,
      accountBalances,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error getting dashboard summary:', error);
    throw error;
  }
};

/**
 * Get personal expenses for current month
 * Excludes: shared expenses, transfers, and "Inversiones" category
 */
export const getPersonalExpenses = async (userId: string) => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Find "Inversiones" category to exclude it
  const inversionesCategory = await prisma.categoryTemplate.findFirst({
    where: {
      name: 'Inversiones',
      type: 'INCOME',
      parentTemplateId: null
    }
  });

  // Build where clause
  const where: any = {
    userId,
    type: 'EXPENSE',
    sharedExpenseId: null, // NOT shared
    date: {
      gte: firstDayOfMonth,
      lte: lastDayOfMonth,
    },
  };

  // Exclude "Inversiones" category if it exists
  if (inversionesCategory) {
    where.categoryId = { not: inversionesCategory.id };
  }

  const result = await prisma.transaction.aggregate({
    where,
    _sum: {
      amount: true,
    },
  });

  return {
    total: Number(result._sum.amount || 0),
    month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
  };
};

/**
 * Get shared expenses total for current month
 * Calculates user's share from ExpenseParticipant.amountOwed
 */
export const getSharedExpensesTotal = async (userId: string) => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get all shared expense transactions for the user
  const sharedExpenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'EXPENSE',
      sharedExpenseId: { not: null },
      date: {
        gte: firstDayOfMonth,
        lte: lastDayOfMonth,
      },
    },
    include: {
      sharedExpense: {
        include: {
          participants: {
            where: { userId }, // Only get current user's participation
          },
        },
      },
    },
  });

  // Sum user's share from ExpenseParticipant.amountOwed
  const total = sharedExpenses.reduce((sum, tx) => {
    const userParticipation = tx.sharedExpense?.participants[0];
    return sum + Number(userParticipation?.amountOwed || 0);
  }, 0);

  return {
    total,
    count: sharedExpenses.length,
    month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
  };
};

/**
 * Get monthly savings
 * Calculation: Total Income - (Personal Expenses + Shared Expenses portion)
 */
export const getMonthlySavings = async (userId: string) => {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get total income
  const incomeResult = await prisma.transaction.aggregate({
    where: {
      userId,
      type: 'INCOME',
      date: {
        gte: firstDayOfMonth,
        lte: lastDayOfMonth,
      },
    },
    _sum: {
      amount: true,
    },
  });

  const totalIncome = Number(incomeResult._sum.amount || 0);

  // Get personal expenses (excluding shared and transfers)
  const personalExpensesData = await getPersonalExpenses(userId);
  const personalExpenses = personalExpensesData.total;

  // Get shared expenses (user's share)
  const sharedExpensesData = await getSharedExpensesTotal(userId);
  const sharedExpenses = sharedExpensesData.total;

  // Calculate savings
  const totalExpenses = personalExpenses + sharedExpenses;
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  return {
    savings,
    savingsRate,
    income: totalIncome,
    expenses: totalExpenses,
    breakdown: {
      personal: personalExpenses,
      shared: sharedExpenses,
    },
    month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
  };
};
