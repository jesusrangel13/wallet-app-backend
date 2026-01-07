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

        // 1. Get ALL Categories (Templates + User Overrides)
        // We remove the parentTemplateId: null filter to allow the AI to see specific subcategories (e.g. "Cafetería")
        const categoryTemplates = await prisma.categoryTemplate.findMany({
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

        // 4. Get User Tags
        const tags = await prisma.tag.findMany({
            where: { userId },
            select: { name: true }
        });
        const tagNames = tags.map(t => t.name);

        return {
            currency_preference: user.currency,
            active_categories: [...new Set(categories)], // Dedup
            recent_payees: recentPayees.slice(0, 20), // Top 20
            available_tags: tagNames,
            common_accounts: accountNames
        };
    }
}
