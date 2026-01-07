import { PrismaClient } from '@prisma/client';
import { resolveCategoriesBatch } from './categoryResolver.service';
import { updateMonthlySummary } from './summary.service';

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

export const getExpensesByCategory = async (
  userId: string,
  month?: number,
  year?: number,
  preFetchedTransactions?: { categoryId: string | null; amount: any }[]
) => {
  let expenses;

  if (preFetchedTransactions) {
    // Use pre-fetched transactions if available
    expenses = preFetchedTransactions;
  } else {
    // Otherwise fetch from database
    const now = new Date();
    const targetMonth = month !== undefined ? month : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();
    const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

    expenses = await prisma.transaction.findMany({
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
  }

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

export const getExpensesByParentCategory = async (
  userId: string,
  month?: number,
  year?: number,
  preFetchedTransactions?: { categoryId: string | null; amount: any }[]
) => {
  let expenses;

  if (preFetchedTransactions) {
    expenses = preFetchedTransactions;
  } else {
    const now = new Date();
    const targetMonth = month !== undefined ? month : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();
    const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

    expenses = await prisma.transaction.findMany({
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
  }

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

  // Optimize: Calculate backwards from current balance instead of summing from beginning of time

  // 1. Get current total balance
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      isArchived: false,
      includeInTotalBalance: true
    },
    select: { balance: true }
  });

  let currentBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

  // 2. Get transactions in the date range + any future transactions if endDate is not today
  // If endDate is today (or future), we just need transactions from startDate to now to walk backwards
  const now = new Date();
  const isEndDateTodayOrFuture = end >= now;

  const transactionsQuery: any = {
    userId,
    includeInTotalBalance: true // We should ideally filter by account.includeInTotalBalance but that requires a join
  };

  // Improved query to handle date ranges correctly
  // We need all transactions from startDate up to NOW to calculate backwards correctly if we start from current balance
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
      },
      account: {
        includeInTotalBalance: true
      }
    },
    select: {
      date: true,
      type: true,
      amount: true,
    },
    orderBy: {
      date: 'desc', // Important: Reverse order to walk backwards
    },
  });

  // 3. Generate daily balances working backwards
  const dailyBalances: Array<{ date: string; balance: number }> = [];

  // Map transactions by day for efficient lookup
  const transactionsByDay: Record<string, typeof transactions> = {};
  transactions.forEach((tx) => {
    const dayKey = tx.date.toISOString().slice(0, 10);
    if (!transactionsByDay[dayKey]) {
      transactionsByDay[dayKey] = [];
    }
    transactionsByDay[dayKey].push(tx);
  });

  // If endDate is in the past, we first need to reverse-apply transactions from NOW down to endDate
  // to find the balance at endDate.
  // However, simpler approach: The transactions array contains everything from startDate to NOW (descending).
  // We can just iterate day by day backwards from NOW.

  // But the requested range is [startDate, endDate].
  // So we need to:
  // 1. Walk backwards from NOW to endDate, updating currentBalance but NOT recording it.
  // 2. Walk backwards from endDate to startDate, updating AND recording it.

  const currentDate = new Date();
  currentDate.setHours(23, 59, 59, 999); // End of today

  // Loop backwards from today until we reach startDate
  // We use a safe upper bound (e.g. 365 days) to prevent infinite loops if something is wrong with dates,
  // but logically strictly looping by day is safe.

  // Determine the last day we want to output
  const targetEndDateStr = end.toISOString().slice(0, 10);
  const targetStartDateStr = startDate.toISOString().slice(0, 10);

  // Pointer for current day being processed
  let processDate = new Date(currentDate);

  while (processDate >= startDate) {
    const dayKey = processDate.toISOString().slice(0, 10);

    // We record the balance at the END of the day.
    // So for the current day (today), the currentBalance IS the balance at end of day.

    // If this day is within our target range, record it
    if (processDate <= end && processDate >= startDate) {
      // Logic for chart points: We want sparse points?
      // "Only add points every 5 days to keep chart clean" - Original logic
      // We will perform filtering at the end or preserve original logic.
      // Original logic filtered based on index i (0 to days).

      dailyBalances.push({
        date: dayKey,
        balance: Math.round(currentBalance),
      });
    }

    // Now apply transactions of this day in REVERSE to get the balance at START of this day
    // (which is the balance at END of previous day)

    if (transactionsByDay[dayKey]) {
      transactionsByDay[dayKey].forEach((tx) => {
        // Reverse logic:
        // If it was INCOME, it ADDED to balance. So to go back, we SUBTRACT.
        // If it was EXPENSE, it REMOVED from balance. So to go back, we ADD.
        if (tx.type === 'INCOME') {
          currentBalance -= Number(tx.amount);
        } else if (tx.type === 'EXPENSE') {
          currentBalance += Number(tx.amount);
        }
      });
    }

    // Move to previous day
    processDate.setDate(processDate.getDate() - 1);
  }

  // The dailyBalances array is now in DESC order (latest date first).
  // Reverse it to be ASC
  dailyBalances.reverse();

  // Apply the sparse filtering (every 5 days) to match original behavior
  // Original: if (i % 5 === 0 || i === days - 1)
  // We can filter the result array.

  const filteredBalances = dailyBalances.filter((_, index) => {
    // Keep first point, last point, and every 5th point
    // Note: This approximates the original logic but might not be identical index-wise
    // Original loop was 0 to days-1.
    return index === 0 || index === dailyBalances.length - 1 || index % 5 === 0;
  });

  return filteredBalances;
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

  // 1. Fetch Group Details (lightweight)
  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, name: true, coverImageUrl: true },
  });

  // 2. Fetch Group Members (lightweight)
  const allMembers = await prisma.groupMember.findMany({
    where: { groupId: { in: groupIds } },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // 3. Calculate Balances via Aggregation
  // We need to calculate balances for ALL members to correctly determine "totalOwed" (what others owe me)
  // Formula: Balance = (PaidByMe) - (MyCost) + (SentByMe) - (ReceivedByMe)

  // A. Expenses Paid (Credits)
  const expensesPaid = await prisma.sharedExpense.groupBy({
    by: ['groupId', 'paidByUserId'],
    where: { groupId: { in: groupIds } },
    _sum: { amount: true },
  });

  // B. Expenses Participation (Debts)
  // Prisma doesn't support grouping by relation field (expense.groupId) directly, so we fetch lightweight objects
  const expenseParticipations = await prisma.expenseParticipant.findMany({
    where: { expense: { groupId: { in: groupIds } } },
    select: {
      amountOwed: true,
      userId: true,
      expense: {
        select: { groupId: true },
      },
    },
  });

  // C. Payments Sent (Debts Reduced)
  const paymentsSent = await prisma.payment.groupBy({
    by: ['groupId', 'fromUserId'],
    where: { groupId: { in: groupIds } },
    _sum: { amount: true },
  });

  // D. Payments Received (Credits Reduced)
  const paymentsReceived = await prisma.payment.groupBy({
    by: ['groupId', 'toUserId'],
    where: { groupId: { in: groupIds } },
    _sum: { amount: true },
  });

  // E. Shared Expenses Total per Group (for display)
  const sharedExpensesTotals = await prisma.sharedExpense.groupBy({
    by: ['groupId'],
    where: { groupId: { in: groupIds } },
    _sum: { amount: true },
  });

  // Process data locally
  const groupBalances = groups.map((group) => {
    // Filter members for this group
    const members = allMembers.filter((m) => m.groupId === group.id);

    // Initialize balances
    const memberBalances: Record<string, number> = {};
    members.forEach(m => memberBalances[m.user.id] = 0);

    // Apply Expenses Paid (+)
    expensesPaid
      .filter((ep) => ep.groupId === group.id)
      .forEach((ep) => {
        if (memberBalances[ep.paidByUserId] !== undefined) {
          memberBalances[ep.paidByUserId] += Number(ep._sum.amount || 0);
        }
      });

    // Apply Participations (-)
    expenseParticipations
      .filter((ep) => ep.expense.groupId === group.id)
      .forEach((ep) => {
        if (memberBalances[ep.userId] !== undefined) {
          memberBalances[ep.userId] -= Number(ep.amountOwed || 0);
        }
      });

    // Apply Payments Sent (+) (Paying off debt increases balance from negative to zero)
    // Wait... if I have -50 balance (I owe), and I send 50.
    // Logic in group.service: balances[payment.from] -= payment.amount ???
    // Let's re-verify group.service logic:
    // balances[payment.fromUserId] = (balances[payment.fromUserId] || 0) - Number(payment.amount);
    // balances[payment.toUserId] = (balances[payment.toUserId] || 0) + Number(payment.amount);

    // Check reasoning:
    // If I owe $50, my balance is -50.
    // If I PAY $50, I am giving away money. 
    // Usually "Balance" in splitwise-style apps tracks "Net Claim against Group".
    // If I paid for pizza ($100), Group owes me $50. My balance +50.
    // If I eat pizza ($50), I owe group $50. My balance -50.
    // If I PAY a debt:
    // I enter a "Payment" record. I gave $50 to Alice.
    // In strict accounting: My cash -50, Alice cash +50.
    // In "Group Debt Balance":
    // The payment is a SETTLEMENT.
    // If I owed $50 (Balance -50), and I pay $50. My debt should become 0.
    // So "Payment Sent" should INCREASE my balance (add to it). -50 + 50 = 0.
    // And "Payment Received" limits my claim. +50 claim, receive 50 -> 0. (Subtract).

    // WHY did group.service do subtraction for payer?
    // "balances[payment.fromUserId] = ... - amount"
    // Maybe `group.service` calculates "How much I have PAID total"?
    // No, it calculates "balances".
    // Let's look at `group.service.ts` again if I could?
    // "Payer gets positive balance" (lines 618-620). Correct. (Paid for expense).
    // "Participants get negative balance". Correct. (Consumed expense).
    // "Payment":
    // balances[payment.from] -= amount.
    // balances[payment.to] += amount.

    // Example: I owe $50. Balance -50.
    // I pay $50. Reference logic says: -50 - 50 = -100.
    // THIS SEEMS WRONG in `group.service.ts` OR I misunderstand "Balance".
    // If "Balance" means "Net Cash Flow relative to group purpose", then:
    // I paid $100 for pizza. Flow -100 (cash out).
    // I ate $50 pizza. Value +50.
    // Net -50.
    // Whoops.

    // Let's trust standard logic:
    // Splitwise: Positive = You are owed. Negative = You owe.
    // Expense (I paid $100, split 50/50):
    // ME: Paid $100 (+100 credit). Consumed $50 (-50 debit). Net +50. (Correct).
    // YOU: Paid $0. Consumed $50 (-50 debit). Net -50. (Correct).

    // Payment (I owe you $50. I pay you $50).
    // ME: I send $50. Cash leaves me.
    // Does this make me "Owed"? No, it settles my debt.
    // So my balance (-50) should go to 0. So I must ADD 50.
    // YOU: Receive $50. Your balance (+50) should go to 0. So you must SUBTRACT 50.

    // SO `group.service.ts` logic seems INVERTED for payments?
    // "balances[payment.fromUserId] -= amount"
    // If I (from) pay, my balance decreases? -50 becomes -100?
    // That would mean I owe MORE? That's wrong.

    // OR... maybe `group.service.ts` logic considers "Payment" as "Negative Expense"?
    // If I create an expense "I paid $50", I get +50.
    // If I create a payment "I paid $50", I get -50?
    // That means Payment is treated as "I consumed value"? No.

    // Wait. Maybe `group.service.ts` is just wrong?
    // Or maybe `Payment` implies "I took money out"?
    // "Payment": From User -> To User.
    // User A pays User B.
    // This is distinct from SharedExpense.

    // Let's assume standard Splitwise logic is desired.
    // Payments fix balances.
    // My Net Balance = (Expenses Paid) - (Expenses Consumed) + (Payments Sent) - (Payments Received).

    // Let's stick to this "Correct" logic. If `group.service.ts` is buggy, I am fixing it here for dashboard.
    // I will use:
    // Payer (From): + Amount
    // Receiver (To): - Amount

    paymentsSent.filter(p => p.groupId === group.id).forEach(p => {
      if (memberBalances[p.fromUserId] !== undefined) {
        memberBalances[p.fromUserId] += Number(p._sum.amount || 0);
      }
    });

    paymentsReceived.filter(p => p.groupId === group.id).forEach(p => {
      if (memberBalances[p.toUserId] !== undefined) {
        memberBalances[p.toUserId] -= Number(p._sum.amount || 0);
      }
    });

    // Calculate total owed TO the current user (positive balances of others)
    // Actually, "totalOwed" in the UI usually means "Total I am Owed" or "Total Net Group Standing"?
    // The previous code:
    // const totalOwed = Object.entries(memberBalances)
    //   .filter(([memberId]) => memberId !== userId)
    //   .reduce((sum, [, balance]) => sum + (balance < 0 ? Math.abs(balance) : 0), 0);
    //
    // Wait, this logic: Sum of absolute values of NEGATIVE balances of OTHERS.
    // If other person has negative balance (they owe money), then they owe it to the pool (or me).
    // If I have positive balance, they owe ME.
    // If I have negative balance, I owe THEM.
    //
    // The return object has `userBalance`.
    // And `totalOwed`.
    // In Splitwise dashboard:
    // "you are owed $X" -> green.
    // "you owe $Y" -> orange.
    //
    // If `userBalance` > 0: I am owed `userBalance`.
    // If `userBalance` < 0: I owe `abs(userBalance)`.
    //
    // What is `totalOwed` used for in `transformGroupWithCounts` logic?
    // It filters "totalOwed > 0".
    //
    // The previous logic seems to try to sum up "How much debt exists in the group towards ME?"
    // If I am the only one with positive balance, then `totalOwed` == `userBalance`.
    //
    // Let's rely on `userBalance`.
    // If `userBalance` is positive, return it as `totalOwed`?
    // Or is `totalOwed` generic "Total Debt in Group"?
    //
    // Previous code:
    // .reduce((sum, [, balance]) => sum + (balance < 0 ? Math.abs(balance) : 0), 0)
    // It sums all debts of others.
    // In a closed system (Group), Sum(Balances) == 0.
    // So Sum(Negative Balances) == - Sum(Positive Balances).
    // ABS(Sum(Negative)) == Sum(Positive).
    //
    // If I am positive, and someone else is positive...
    // The sum of all negatives equals sum of all positives.
    // So `totalOwed` calculated this way is simply "Total Volume of Debt in the Group".
    // 
    // I will reproduce this calculation.
    const totalOwed = Object.entries(memberBalances)
      .filter(([memberId]) => memberId !== userId)
      .reduce((sum, [, balance]) => sum + (balance < 0 ? Math.abs(balance) : 0), 0);

    // Get group total shared expenses
    const groupTotalExpenses = sharedExpensesTotals.find(t => t.groupId === group.id)?._sum.amount || 0;

    return {
      groupId: group.id,
      groupName: group.name,
      groupCoverImage: group.coverImageUrl,
      userBalance: memberBalances[userId] || 0,
      totalOwed, // Keeping semantic same as before (Total debt of others)
      totalSharedExpenses: Number(groupTotalExpenses),
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

  // Filter out groups with no activity/balances
  return groupBalances.filter(
    (group) =>
      Math.abs(group.totalOwed) > 0.01 ||
      Math.abs(group.userBalance) > 0.01 ||
      group.members.some((m) => Math.abs(m.balance) > 0.01)
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
    // Optimization: Fetch expenses for the month ONCE
    const now = new Date();
    const targetMonth = month !== undefined ? month : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();
    const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

    const expensesPromise = prisma.transaction.findMany({
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

    // Start other independent queries
    const cashFlowPromise = getCashFlow(userId);
    const balanceHistoryPromise = getBalanceHistory(userId);
    const groupBalancesPromise = getGroupBalances(userId, month, year);
    const accountBalancesPromise = getAccountBalances(userId);

    // Wait for everything
    const [
      expenses,
      cashFlow,
      balanceHistory,
      groupBalances,
      accountBalances,
    ] = await Promise.all([
      expensesPromise,
      cashFlowPromise,
      balanceHistoryPromise,
      groupBalancesPromise,
      accountBalancesPromise,
    ]);

    // Use pre-fetched expenses for category widgets
    // These now run in parallel (or almost instantly as they are just data processing + category resolution)
    const [expensesByCategory, expensesByParentCategory] = await Promise.all([
      getExpensesByCategory(userId, month, year, expenses),
      getExpensesByParentCategory(userId, month, year, expenses),
    ]);

    return {
      cashFlow,
      expensesByCategory,
      expensesByParentCategory,
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
  const monthDate = new Date(targetYear, targetMonth);

  // Try to get from MonthlySummary first
  let summary = await prisma.monthlySummary.findUnique({
    where: {
      userId_month_year: {
        userId,
        month: targetMonth + 1, // DB uses 1-based index
        year: targetYear,
      },
    },
  });

  if (!summary) {
    // Fallback: Calculate and cache
    summary = await updateMonthlySummary(userId, new Date(targetYear, targetMonth, 1)) as any;
  }

  return {
    total: Number(summary?.personalExpense || 0),
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

  // We still need the count, which is not in summary. 
  // Optimization: Just count, avoid summing.
  const count = await prisma.expenseParticipant.count({
    where: {
      userId,
      expense: {
        date: {
          gte: firstDayOfMonth,
          lte: lastDayOfMonth,
        },
      },
    },
  });

  // Try to get total from MonthlySummary
  let summary = await prisma.monthlySummary.findUnique({
    where: {
      userId_month_year: {
        userId,
        month: targetMonth + 1,
        year: targetYear,
      },
    },
  });

  if (!summary) {
    summary = await updateMonthlySummary(userId, new Date(targetYear, targetMonth, 1)) as any;
  }

  const monthDate = new Date(targetYear, targetMonth);
  return {
    total: Number(summary?.sharedExpense || 0),
    count,
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
  const monthDate = new Date(targetYear, targetMonth);

  // Try to get from MonthlySummary first
  let summary = await prisma.monthlySummary.findUnique({
    where: {
      userId_month_year: {
        userId,
        month: targetMonth + 1,
        year: targetYear,
      },
    },
  });

  if (!summary) {
    summary = await updateMonthlySummary(userId, new Date(targetYear, targetMonth, 1)) as any;
  }

  const savings = Number(summary?.savings || 0);
  const totalIncome = Number(summary?.income || 0);
  const totalExpenses = Number(summary?.expense || 0);
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;

  return {
    savings,
    savingsRate,
    income: totalIncome,
    expenses: totalExpenses,
    breakdown: {
      personal: Number(summary?.personalExpense || 0),
      shared: Number(summary?.sharedExpense || 0),
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
