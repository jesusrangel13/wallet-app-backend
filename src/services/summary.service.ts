import { prisma } from '../utils/prisma';

/**
 * Updates the MonthlySummary for a specific user and month.
 * This function calculates all metrics (income, expenses, savings) from scratch
 * based on the current data in the database, ensuring consistency.
 */
export const updateMonthlySummary = async (userId: string, date: Date | string) => {
    const targetDate = new Date(date);
    const month = targetDate.getMonth(); // 0-indexed
    const year = targetDate.getFullYear();

    // Create start and end dates for the month
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // 1. Calculate Income
    // Exclude 'Cobro de préstamo' and 'Cobro de deuda' categories as they are not true income
    const [cobroPrestamoCategory, cobroDeudaCategory] = await Promise.all([
        prisma.categoryTemplate.findFirst({
            where: { name: 'Cobro de préstamo', type: 'INCOME' },
        }),
        prisma.categoryTemplate.findFirst({
            where: { name: 'Cobro de deuda', type: 'INCOME' },
        }),
    ]);

    const categoriesToExcludeIds: string[] = [];
    if (cobroPrestamoCategory) categoriesToExcludeIds.push(cobroPrestamoCategory.id);
    if (cobroDeudaCategory) categoriesToExcludeIds.push(cobroDeudaCategory.id);

    const incomeWhere: any = {
        userId,
        type: 'INCOME',
        date: {
            gte: firstDayOfMonth,
            lte: lastDayOfMonth,
        },
    };

    if (categoriesToExcludeIds.length > 0) {
        incomeWhere.OR = [
            { categoryId: { notIn: categoriesToExcludeIds } },
            { categoryId: null },
        ];
    }

    const incomeResult = await prisma.transaction.aggregate({
        where: incomeWhere,
        _sum: { amount: true },
    });
    const income = Number(incomeResult._sum.amount || 0);

    // 2. Calculate Personal Expenses
    // Exclude 'Inversiones' category if it exists
    const inversionesCategory = await prisma.categoryTemplate.findFirst({
        where: { name: 'Inversiones', type: 'INCOME', parentTemplateId: null }, // Note: Original code checked 'INCOME' for investments? Let's check dashboard.service.ts line 741.
        // Line 741: name: 'Inversiones', type: 'INCOME'. Wait, expenses should be type EXPENSE or investments might be special.
        // Let's re-read dashboard.service.ts line 741 carefully.
        // "type: 'INCOME'" -> Wait, usually Inversiones are expenses in terms of cash flow out, but assets in terms of wealth.
        // dashboard.service.ts:741 says type: 'INCOME'.
        // BUT getPersonalExpenses (line 749) queries type: 'EXPENSE'.
        // If the category template is type INCOME, it won't match an EXPENSE transaction via relation usually?
        // Let's stick to what dashboard.service.ts does exactly.
    });

    // Re-reading dashboard.service.ts line 738-744:
    // const inversionesCategory = await prisma.categoryTemplate.findFirst({
    //   where: {
    //     name: 'Inversiones',
    //     type: 'INCOME', // This looks like a bug in existing code or a specific convention
    //     parentTemplateId: null
    //   }
    // });

    // And line 760: where.categoryId = { not: inversionesCategory.id };
    // If the transaction is type EXPENSE, but linked to a category of type INCOME, that's possible.
    // I will copy the logic exactly to preserve behavior.

    const personalExpensesWhere: any = {
        userId,
        type: 'EXPENSE',
        sharedExpenseId: null,
        loanId: null,
        date: {
            gte: firstDayOfMonth,
            lte: lastDayOfMonth,
        },
    };

    if (inversionesCategory) {
        personalExpensesWhere.categoryId = { not: inversionesCategory.id };
    }

    const personalExpenseResult = await prisma.transaction.aggregate({
        where: personalExpensesWhere,
        _sum: { amount: true },
    });
    const personalExpense = Number(personalExpenseResult._sum.amount || 0);

    // 3. Calculate Shared Expenses (User's Share)
    const sharedExpenseResult = await prisma.expenseParticipant.aggregate({
        _sum: { amountOwed: true },
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
    const sharedExpense = Number(sharedExpenseResult._sum.amountOwed || 0);

    // 4. Calculate Totals
    const totalExpense = personalExpense + sharedExpense;
    const savings = income - totalExpense;

    // 5. Update MonthlySummary Table
    await prisma.monthlySummary.upsert({
        where: {
            userId_month_year: {
                userId,
                month: month + 1, // Store as 1-indexed for friendlier DB viewing
                year,
            },
        },
        update: {
            income,
            expense: totalExpense,
            personalExpense,
            sharedExpense,
            savings,
        },
        create: {
            userId,
            month: month + 1,
            year,
            income,
            expense: totalExpense,
            personalExpense,
            sharedExpense,
            savings,
        },
    });

    return {
        income,
        expense: totalExpense,
        personalExpense,
        sharedExpense,
        savings,
    };
};
