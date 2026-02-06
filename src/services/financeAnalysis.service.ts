import { prisma } from '../utils/prisma';
import { resolveCategoriesBatch } from './categoryResolver.service';

/**
 * Get top tags by usage for a specific month
 */
export const getTopTags = async (userId: string, month?: number, year?: number, limit: number = 10) => {
    const now = new Date();
    const targetMonth = month !== undefined ? month : now.getMonth();
    const targetYear = year !== undefined ? year : now.getFullYear();
    const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

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

export const getCashFlow = async (userId: string, months: number = 6, endDate?: Date) => {
    const end = endDate || new Date();
    const startDate = new Date(end);
    startDate.setMonth(startDate.getMonth() - months);

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

    const monthlyData: Record<string, { income: number; expense: number }> = {};

    transactions.forEach((tx) => {
        const monthKey = tx.date.toISOString().slice(0, 7);
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { income: 0, expense: 0 };
        }

        if (tx.type === 'INCOME') {
            monthlyData[monthKey].income += Number(tx.amount);
        } else if (tx.type === 'EXPENSE') {
            monthlyData[monthKey].expense += Number(tx.amount);
        }
    });

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
        .slice(-months);

    return result;
};

export const getExpensesByCategory = async (
    userId: string,
    month?: number,
    year?: number,
    data?: {
        personal: { categoryId: string | null; amount: any }[];
        shared: { expense: { categoryId: string | null }; amountOwed: any }[];
    }
) => {
    let personalTransactions;
    let sharedParticipations;

    if (data) {
        personalTransactions = data.personal;
        sharedParticipations = data.shared;
    } else {
        const now = new Date();
        const targetMonth = month !== undefined ? month : now.getMonth();
        const targetYear = year !== undefined ? year : now.getFullYear();
        const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

        personalTransactions = await prisma.transaction.findMany({
            where: {
                userId,
                type: 'EXPENSE',
                sharedExpenseId: null,
                loanId: null,
                date: { gte: firstDayOfMonth, lte: lastDayOfMonth },
            },
            select: { categoryId: true, amount: true },
        });

        sharedParticipations = await prisma.expenseParticipant.findMany({
            where: {
                userId,
                expense: { date: { gte: firstDayOfMonth, lte: lastDayOfMonth } },
            },
            select: {
                amountOwed: true,
                expense: { select: { categoryId: true } },
            },
        });
    }

    const categoryIds = [
        ...personalTransactions.map((e) => e.categoryId),
        ...sharedParticipations.map((e) => e.expense.categoryId),
    ];
    const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

    const categoryData: Record<string, number> = {};
    let totalExpenses = 0;

    personalTransactions.forEach((expense) => {
        const categoryInfo = expense.categoryId ? categoryMap.get(expense.categoryId) : null;
        const categoryName = categoryInfo?.name || 'Uncategorized';

        if (categoryName === 'Inversiones') return;

        const amount = Number(expense.amount);
        if (!categoryData[categoryName]) categoryData[categoryName] = 0;
        categoryData[categoryName] += amount;
        totalExpenses += amount;
    });

    sharedParticipations.forEach((part) => {
        const categoryId = part.expense.categoryId;
        const categoryInfo = categoryId ? categoryMap.get(categoryId) : null;
        const categoryName = categoryInfo?.name || 'Uncategorized';

        if (categoryName === 'Inversiones') return;

        const amount = Number(part.amountOwed);
        if (!categoryData[categoryName]) categoryData[categoryName] = 0;
        categoryData[categoryName] += amount;
        totalExpenses += amount;
    });

    return Object.entries(categoryData).map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
    }));
};

export const getExpensesByParentCategory = async (
    userId: string,
    month?: number,
    year?: number,
    data?: {
        personal: { categoryId: string | null; amount: any }[];
        shared: { expense: { categoryId: string | null }; amountOwed: any }[];
    }
) => {
    let personalTransactions;
    let sharedParticipations;

    if (data) {
        personalTransactions = data.personal;
        sharedParticipations = data.shared;
    } else {
        const now = new Date();
        const targetMonth = month !== undefined ? month : now.getMonth();
        const targetYear = year !== undefined ? year : now.getFullYear();
        const firstDayOfMonth = new Date(targetYear, targetMonth, 1);
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0);

        personalTransactions = await prisma.transaction.findMany({
            where: {
                userId,
                type: 'EXPENSE',
                sharedExpenseId: null,
                loanId: null,
                date: { gte: firstDayOfMonth, lte: lastDayOfMonth },
            },
            select: { categoryId: true, amount: true },
        });

        sharedParticipations = await prisma.expenseParticipant.findMany({
            where: {
                userId,
                expense: { date: { gte: firstDayOfMonth, lte: lastDayOfMonth } },
            },
            select: {
                amountOwed: true,
                expense: { select: { categoryId: true } },
            },
        });
    }

    const categoryIds = [
        ...personalTransactions.map((e) => e.categoryId),
        ...sharedParticipations.map((e) => e.expense.categoryId),
    ];
    const categoryMap = await resolveCategoriesBatch(categoryIds, userId);

    const categoryData: Record<
        string,
        { amount: number; icon: string | null; color: string | null }
    > = {};
    let totalExpenses = 0;

    const processItem = (categoryId: string | null, amount: number) => {
        const categoryInfo = categoryId ? categoryMap.get(categoryId) : null;

        if (categoryInfo?.name === 'Inversiones' || categoryInfo?.parent?.name === 'Inversiones') return;

        const parentCategory = categoryInfo?.parent || categoryInfo;
        const categoryName = parentCategory?.name || 'Uncategorized';
        const categoryIcon = parentCategory?.icon || null;
        const categoryColor = parentCategory?.color || null;

        if (!categoryData[categoryName]) {
            categoryData[categoryName] = {
                amount: 0,
                icon: categoryIcon,
                color: categoryColor,
            };
        }
        categoryData[categoryName].amount += amount;
        totalExpenses += amount;
    };

    personalTransactions.forEach(tx => processItem(tx.categoryId, Number(tx.amount)));
    sharedParticipations.forEach(part => processItem(part.expense.categoryId, Number(part.amountOwed)));

    return Object.entries(categoryData)
        .map(([category, data]) => ({
            category,
            amount: data.amount,
            percentage: totalExpenses > 0 ? (data.amount / totalExpenses) * 100 : 0,
            icon: data.icon,
            color: data.color,
        }))
        .sort((a, b) => b.amount - a.amount);
};
