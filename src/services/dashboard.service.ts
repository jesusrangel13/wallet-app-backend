import { PrismaClient } from '@prisma/client';
import { resolveCategoriesBatch } from './categoryResolver.service';

const prisma = new PrismaClient();

export const getCashFlow = async (userId: string, months: number = 6, endDate?: Date) => {
  const end = endDate || new Date();
  const startDate = new Date(end);
  startDate.setMonth(startDate.getMonth() - months);

  // Get transactions grouped by month
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: end,
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

export const getExpensesByCategory = async (userId: string, month?: number, year?: number) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

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

export const getExpensesByParentCategory = async (userId: string, month?: number, year?: number) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

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

export const getBalanceHistory = async (userId: string, days: number = 30, endDate?: Date) => {
  const end = endDate || new Date();
  const startDate = new Date(end);
  startDate.setDate(startDate.getDate() - days);

  // Optimize: Use database aggregation instead of loading all transactions into memory
  // Get transactions only for the display range
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: end,
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

export const getGroupBalances = async (userId: string, month?: number, year?: number) => {
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

    // Calculate total shared expenses for the group
    const totalSharedExpenses = sharedExpenses.reduce((sum, expense) => {
      return sum + Number(expense.amount);
    }, 0);

    return {
      groupId: group.id,
      groupName: group.name,
      groupCoverImage: group.coverImageUrl,
      userBalance: memberBalances[userId] || 0,
      totalOwed,
      totalSharedExpenses,
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
      color: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: Number(account.balance),
    currency: account.currency,
    creditLimit: account.creditLimit ? Number(account.creditLimit) : null,
    color: account.color || '#3b82f6',
  }));
};

/**
 * Unified dashboard summary endpoint that returns all widget data in a single request
 * This eliminates the need for multiple API calls to load the dashboard
 */
export const getDashboardSummary = async (userId: string, month?: number, year?: number) => {
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
      getExpensesByCategory(userId, month, year),
      getBalanceHistory(userId),
      getGroupBalances(userId, month, year),
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
export const getPersonalExpenses = async (userId: string, month?: number, year?: number) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

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

  const monthDate = new Date(targetYear, targetMonth);
  return {
    total: Number(result._sum.amount || 0),
    month: monthDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
  };
};

/**
 * Get shared expenses total for current month
 * Calculates user's share from ExpenseParticipant.amountOwed
 */
export const getSharedExpensesTotal = async (userId: string, month?: number, year?: number) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

  // Get shared expenses where the user is a participant
  // Filter by SharedExpense.date (when expense occurred), NOT Transaction.date (when marked as paid)
  const sharedExpenses = await prisma.sharedExpense.findMany({
    where: {
      date: {
        gte: firstDayOfMonth,
        lte: lastDayOfMonth,
      },
      participants: {
        some: {
          userId,
        },
      },
    },
    include: {
      participants: {
        where: { userId }, // Only get current user's participation
      },
    },
  });

  // Sum user's share from ExpenseParticipant.amountOwed
  const total = sharedExpenses.reduce((sum, expense) => {
    const userParticipation = expense.participants[0];
    return sum + Number(userParticipation?.amountOwed || 0);
  }, 0);

  const monthDate = new Date(targetYear, targetMonth);
  return {
    total,
    count: sharedExpenses.length,
    month: monthDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
  };
};

/**
 * Get monthly savings
 * Calculation: Total Income - (Personal Expenses + Shared Expenses portion)
 */
export const getMonthlySavings = async (userId: string, month?: number, year?: number) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

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
  const personalExpensesData = await getPersonalExpenses(userId, month, year);
  const personalExpenses = personalExpensesData.total;

  // Get shared expenses (user's share)
  const sharedExpensesData = await getSharedExpensesTotal(userId, month, year);
  const sharedExpenses = sharedExpensesData.total;

  // Calculate savings
  const totalExpenses = personalExpenses + sharedExpenses;
  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  const monthDate = new Date(targetYear, targetMonth);
  return {
    savings,
    savingsRate,
    income: totalIncome,
    expenses: totalExpenses,
    breakdown: {
      personal: personalExpenses,
      shared: sharedExpenses,
    },
    month: monthDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
  };
};

/**
 * Get expenses grouped by tag for a specific month
 * Returns distribution of expenses across different tags
 */
export const getExpensesByTag = async (userId: string, month?: number, year?: number) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

  // Get all expenses with their tags for the month
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
      tags: {
        include: {
          tag: true,
        },
      },
    },
  });

  // Group by tag
  const tagData: Record<string, { amount: number; color: string | null; transactionCount: number }> = {};
  let totalExpenses = 0;
  let expensesWithTags = 0;

  expenses.forEach((expense) => {
    const amount = Number(expense.amount);

    if (expense.tags.length > 0) {
      expensesWithTags += amount;
      expense.tags.forEach((transactionTag) => {
        const tag = transactionTag.tag;
        const tagName = tag.name;

        if (!tagData[tagName]) {
          tagData[tagName] = {
            amount: 0,
            color: tag.color,
            transactionCount: 0,
          };
        }

        tagData[tagName].amount += amount;
        tagData[tagName].transactionCount += 1;
      });
    }

    totalExpenses += amount;
  });

  // Convert to array with percentages, sorted by amount descending
  const result = Object.entries(tagData)
    .map(([tagName, data]) => ({
      tagName,
      tagColor: data.color,
      totalAmount: data.amount,
      percentage: expensesWithTags > 0 ? (data.amount / expensesWithTags) * 100 : 0,
      transactionCount: data.transactionCount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return result;
};

/**
 * Get top tags by usage for a specific month
 * Returns tags ordered by total amount spent, with statistics
 */
export const getTopTags = async (userId: string, month?: number, year?: number, limit: number = 10) => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

  // Get all transactions with tags for the month
  const transactionsWithTags = await prisma.transactionTag.findMany({
    where: {
      transaction: {
        userId,
        date: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
    },
    include: {
      tag: true,
      transaction: {
        select: {
          amount: true,
          type: true,
        },
      },
    },
  });

  // Group by tag and calculate statistics
  const tagStats: Record<string, {
    tagId: string;
    tagName: string;
    tagColor: string | null;
    amounts: number[];
    types: string[];
  }> = {};

  transactionsWithTags.forEach((tt) => {
    const tagId = tt.tag.id;
    const tagName = tt.tag.name;
    const tagColor = tt.tag.color;
    const amount = Number(tt.transaction.amount);
    const type = tt.transaction.type;

    if (!tagStats[tagId]) {
      tagStats[tagId] = {
        tagId,
        tagName,
        tagColor,
        amounts: [],
        types: [],
      };
    }

    tagStats[tagId].amounts.push(amount);
    tagStats[tagId].types.push(type);
  });

  // Calculate final statistics and convert to array
  const result = Object.entries(tagStats)
    .map(([tagId, data]) => {
      const totalAmount = data.amounts.reduce((sum, amount) => sum + amount, 0);
      const transactionCount = data.amounts.length;
      const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;

      return {
        tagId: data.tagId,
        tagName: data.tagName,
        tagColor: data.tagColor,
        transactionCount,
        totalAmount,
        averageAmount,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);

  return result;
};

/**
 * Get tag trend over time
 * Returns monthly spending data for specified tags
 */
export const getTagTrend = async (
  userId: string,
  months: number = 6,
  tagIds?: string[]
) => {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - months);

  // If no specific tags provided, get top 5 tags by amount in the period
  let targetTagIds = tagIds;
  if (!targetTagIds || targetTagIds.length === 0) {
    // Get all transaction tags in the period with their amounts
    const transactionsInPeriod = await prisma.transactionTag.findMany({
      where: {
        transaction: {
          userId,
          type: 'EXPENSE',
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      },
      include: {
        transaction: {
          select: {
            amount: true,
          },
        },
      },
    });

    // Calculate totals per tag
    const tagTotals: Record<string, number> = {};
    transactionsInPeriod.forEach(tt => {
      if (!tagTotals[tt.tagId]) {
        tagTotals[tt.tagId] = 0;
      }
      tagTotals[tt.tagId] += Number(tt.transaction.amount);
    });

    // Get top 5 tags by amount
    targetTagIds = Object.entries(tagTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tagId]) => tagId);
  }

  if (targetTagIds.length === 0) {
    return [];
  }

  // Get tag information
  const tags = await prisma.tag.findMany({
    where: {
      id: { in: targetTagIds },
      userId,
    },
    select: {
      id: true,
      name: true,
      color: true,
    },
  });

  // Get all transactions with these tags in the period
  const transactionsWithTags = await prisma.transactionTag.findMany({
    where: {
      tagId: { in: targetTagIds },
      transaction: {
        userId,
        type: 'EXPENSE',
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    include: {
      transaction: {
        select: {
          date: true,
          amount: true,
        },
      },
    },
  });

  // Group by tag and month
  const tagMonthlyData: Record<string, Record<string, number>> = {};

  // Initialize structure
  tags.forEach(tag => {
    tagMonthlyData[tag.id] = {};
  });

  // Populate with transaction data
  transactionsWithTags.forEach(tt => {
    const monthKey = tt.transaction.date.toISOString().slice(0, 7); // YYYY-MM format
    const tagId = tt.tagId;
    const amount = Number(tt.transaction.amount);

    if (!tagMonthlyData[tagId][monthKey]) {
      tagMonthlyData[tagId][monthKey] = 0;
    }

    tagMonthlyData[tagId][monthKey] += amount;
  });

  // Format result
  const result = tags.map(tag => {
    const monthlyData = [];

    // Generate data for each month
    for (let i = 0; i < months; i++) {
      const currentDate = new Date(startDate);
      currentDate.setMonth(currentDate.getMonth() + i);
      const monthKey = currentDate.toISOString().slice(0, 7);
      const [year, month] = monthKey.split('-');

      monthlyData.push({
        month: parseInt(month),
        year: parseInt(year),
        amount: tagMonthlyData[tag.id][monthKey] || 0,
      });
    }

    return {
      tagId: tag.id,
      tagName: tag.name,
      tagColor: tag.color,
      monthlyData,
    };
  });

  return result;
};
