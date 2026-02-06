import { prisma } from '../src/utils/prisma';
import { resolveCategoriesBatch } from '../src/services/categoryResolver.service'; // Assuming this service exists and can be used

async function main() {
    const email = 'jesusrangel.255@gmail.com';
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        console.log(`User ${email} not found.`);
        return;
    }

    const userId = user.id;
    console.log(`Found User ID: ${userId}`);

    // Date Range: January 2026 (based on current date being Feb 2026)
    const startOfMonth = new Date('2026-01-01T00:00:00.000Z');
    const endOfMonth = new Date('2026-01-31T23:59:59.999Z');

    console.log(`Analyzing period: ${startOfMonth.toISOString()} to ${endOfMonth.toISOString()}`);

    // Fetch transactions with Tags
    const transactions = await prisma.transaction.findMany({
        where: {
            userId,
            type: 'EXPENSE',
            date: { gte: startOfMonth, lte: endOfMonth }
        },
        select: {
            id: true,
            payee: true,
            description: true,
            amount: true,
            categoryId: true,
            tags: {
                select: {
                    tag: { select: { name: true } }
                }
            }
        }
    });

    console.log(`Total Transactions in Jan: ${transactions.length}`);

    // Resolve Categories
    const categoryIds = transactions.map(t => t.categoryId).filter(id => id !== null) as string[];
    // We need to implement a simple resolver if the service isn't easily importable, 
    // but let's try to use the one we saw used in dashboard.service.ts
    // To avoid complex imports in this script, let's just fetch Templates manually since it's a script.
    const templates = await prisma.categoryTemplate.findMany({
        where: { id: { in: categoryIds } }
    });
    const categoryMap = new Map(templates.map(t => [t.id, t.name]));

    // Also check UserOverrides if needed, but for prompt estimation base templates are usually enough info.

    // Grouping Logic
    const analysis: Record<string, any> = {};

    transactions.forEach(tx => {
        // Determine Identity: Payee > Description
        let name = tx.payee || tx.description || 'Unknown';
        // Normalize
        name = name.trim();

        // Determine Category
        const category = tx.categoryId ? (categoryMap.get(tx.categoryId) || 'Other') : 'Uncategorized';

        // Determine Tags
        const tags = tx.tags.map(t => t.tag.name);

        if (!analysis[name]) {
            analysis[name] = {
                count: 0,
                total: 0,
                categories: new Set(),
                tags: new Set()
            };
        }

        analysis[name].count++;
        analysis[name].total += Number(tx.amount);
        analysis[name].categories.add(category);
        tags.forEach(t => analysis[name].tags.add(t));
    });

    // Convert Sets to Arrays for JSON
    const groupedData = Object.entries(analysis).map(([name, stats]) => ({
        name,
        count: stats.count,
        total: stats.total,
        categories: Array.from(stats.categories),
        tags: Array.from(stats.tags)
    }));

    // Top Spenders
    const topSpenders = [...groupedData].sort((a, b) => b.total - a.total).slice(0, 5);

    // Most Frequent
    const mostFrequent = [...groupedData].sort((a, b) => b.count - a.count).slice(0, 5);

    const context = {
        period: "January 2026",
        habits: {
            top_merchants_by_amount: topSpenders,
            top_merchants_by_frequency: mostFrequent
        }
    };

    console.log('--- GENERATED CONTEXT FOR AI ---');
    console.log(JSON.stringify(context, null, 2));

    // Token Estimation (Approx 4 chars per token)
    const jsonString = JSON.stringify(context);
    const tokenCount = Math.ceil(jsonString.length / 4);
    console.log(`\nEstimated Token Usage: ~${tokenCount} tokens`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
