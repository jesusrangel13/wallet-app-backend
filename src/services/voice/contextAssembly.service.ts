import { prisma } from '../../utils/prisma';

export class ContextAssemblyService {
    /**
     * Builds the user context object for the AI prompt.
     * Includes:
     * - Preferred Currency
     * - Active Categories (names)
     * - Recent Payees (last 20 unique merchants)
     * - Accounts (names and types)
     */
    async getUserContext(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { currency: true }
        });

        if (!user) throw new Error('User not found');

        // 1. Get Categories (Templates + User Overrides that are active)
        const categoryTemplates = await prisma.categoryTemplate.findMany({
            where: { parentTemplateId: null }, // Start with top-level or fetch all flattening names? 
            // For simplicity in V1, let's fetch all active overrides or templates.
            // Actually, better to fetch what the user sees. 
            // Simplified approach: Get all Category Templates names + User Overrides names.
            select: { name: true }
        });

        const userOverrides = await prisma.userCategoryOverride.findMany({
            where: { userId, isActive: true },
            select: { name: true }
        });

        const categories = [
            ...categoryTemplates.map(c => c.name),
            ...userOverrides.map(c => c.name)
        ];

        // 2. Get Recent Payees (Last 50 transactions to get unique payees)
        const recentTransactions = await prisma.transaction.findMany({
            where: { userId, payee: { not: null } },
            orderBy: { date: 'desc' },
            take: 50,
            select: { payee: true }
        });

        // Unique payees
        const recentPayees = [...new Set(recentTransactions.map(t => t.payee).filter(Boolean))];

        // 3. Get Accounts
        const accounts = await prisma.account.findMany({
            where: { userId, isArchived: false },
            select: { name: true, type: true }
        });
        const accountNames = accounts.map(a => `${a.name} (${a.type})`);

        return {
            currency_preference: user.currency,
            active_categories: [...new Set(categories)], // Dedup
            recent_payees: recentPayees.slice(0, 20), // Top 20
            common_accounts: accountNames
        };
    }
}
