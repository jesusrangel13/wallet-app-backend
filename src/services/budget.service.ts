import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { PaginationParams, calculatePagination, calculateSkip, PaginatedResponse } from '../@types/pagination.types';

const prisma = new PrismaClient();

interface CreateBudgetData {
  amount: number;
  month: number;
  year: number;
}

export const createBudget = async (userId: string, data: CreateBudgetData) => {
  // Check if budget already exists for this month/year
  const existingBudget = await prisma.budget.findUnique({
    where: {
      userId_month_year: {
        userId,
        month: data.month,
        year: data.year,
      },
    },
  });

  if (existingBudget) {
    throw new AppError('Budget already exists for this period', 400);
  }

  const budget = await prisma.budget.create({
    data: {
      userId,
      amount: data.amount,
      month: data.month,
      year: data.year,
    },
  });

  return budget;
};

export const getBudgets = async (
  userId: string,
  year?: number,
  pagination?: PaginationParams
): Promise<PaginatedResponse<any>> => {
  const where: any = { userId };

  if (year) {
    where.year = year;
  }

  // Pagination parameters with defaults
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 50, 100); // Default 50, max 100
  const skip = calculateSkip(page, limit);

  // Get total count for pagination metadata
  const total = await prisma.budget.count({ where });

  // Get paginated budgets
  const budgets = await prisma.budget.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    skip,
    take: limit,
  });

  return {
    data: budgets,
    pagination: calculatePagination(page, limit, total),
  };
};

export const getBudgetById = async (userId: string, budgetId: string) => {
  const budget = await prisma.budget.findFirst({
    where: { id: budgetId, userId },
  });

  if (!budget) {
    throw new AppError('Budget not found', 404);
  }

  return budget;
};

export const updateBudget = async (
  userId: string,
  budgetId: string,
  amount: number
) => {
  const existingBudget = await prisma.budget.findFirst({
    where: { id: budgetId, userId },
  });

  if (!existingBudget) {
    throw new AppError('Budget not found', 404);
  }

  const budget = await prisma.budget.update({
    where: { id: budgetId },
    data: { amount },
  });

  return budget;
};

export const deleteBudget = async (userId: string, budgetId: string) => {
  const existingBudget = await prisma.budget.findFirst({
    where: { id: budgetId, userId },
  });

  if (!existingBudget) {
    throw new AppError('Budget not found', 404);
  }

  await prisma.budget.delete({
    where: { id: budgetId },
  });

  return { message: 'Budget deleted successfully' };
};

export const getBudgetVsActual = async (
  userId: string,
  month: number,
  year: number
) => {
  // Get budget for the period
  const budget = await prisma.budget.findUnique({
    where: {
      userId_month_year: {
        userId,
        month,
        year,
      },
    },
  });

  // Get actual spending for the period
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'EXPENSE',
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const actualSpending = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  // Calculate by category
  const spendingByCategory: Record<string, number> = {};
  transactions.forEach((t) => {
    const categoryKey = t.categoryId || 'uncategorized';
    spendingByCategory[categoryKey] = (spendingByCategory[categoryKey] || 0) + Number(t.amount);
  });

  return {
    budget: budget ? Number(budget.amount) : 0,
    actual: actualSpending,
    remaining: (budget ? Number(budget.amount) : 0) - actualSpending,
    percentageUsed: budget ? (actualSpending / Number(budget.amount)) * 100 : 0,
    byCategory: spendingByCategory,
  };
};

export const getCurrentMonthBudget = async (userId: string) => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  return getBudgetVsActual(userId, month, year);
};
