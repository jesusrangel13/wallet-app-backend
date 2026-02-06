import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { env } from '../config/env';
import Groq from 'groq-sdk';
import { getCashFlow, getExpensesByCategory, getTopTags } from './financeAnalysis.service';
// getMonthlySummaryData removed


const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export class SmartInsightsService {

    /**
     * Get or generate the daily insights for the user.
     * Strategy:
     * 1. Check if insights were already generated TODAY.
     * 2. If yes, return them.
     * 3. If no, generate new ones, save them, and return them.
     */
    /**
     * Get stored insights for today without triggering generation.
     */
    async getStoredInsights(userId: string) {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        return prisma.aiInsight.findMany({
            where: {
                userId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * @deprecated Use separate getStoredInsights or generateDailyInsightsForBatch
     */
    async getDailyInsights(userId: string, existingHeuristicInsights: any[] = []) {
        // Fallback for backward compatibility if needed, but we should migrate to getStoredInsights
        const existing = await this.getStoredInsights(userId);
        if (existing.length > 0) return existing;

        // If not found, return empty (don't generate on demand anymore for speed)
        return [];
    }

    /**
     * Public method to force generation of insights (for Batch Jobs).
     */
    public async generateDailyInsightsForBatch(userId: string, heuristicInsights: any[]) {
        // Force generation even if exists? Or reuse logic?
        // Let's check logic: getDailyInsights checks DB.
        // We want to FORCE new ones or just ensure they exist for today.
        // If we run this at 1 AM, likely they don't exist.
        // But if we re-run, we might duplicate? 
        // Let's assume we want to ensure they exist.

        const existing = await this.getStoredInsights(userId);
        if (existing.length > 0) {
            return existing; // Already done
        }

        return this.generateInsights(userId, heuristicInsights);
    }

    /**
     * Generate new AI insights based on user context.
     * Made public just in case, but usually used via generateDailyInsightsForBatch
     */
    public async generateInsights(userId: string, heuristicInsights: any[]) {
        try {
            // 1. Basic Financial Context
            // We need monthly income/expense/savings. getDashboardSummary did this via getCashFlow.
            // Let's use getCashFlow directly.
            const cashFlow = await getCashFlow(userId);
            const topTags = await getTopTags(userId, undefined, undefined, 10);
            const expensesByCategory = await getExpensesByCategory(userId);

            // Extract monthly totals
            const latestCashFlow = cashFlow[cashFlow.length - 1]; // Current month
            const currentIncome = Number(latestCashFlow?.income || 0);
            const currentExpense = Number(latestCashFlow?.expense || 0);
            const currentSavings = currentIncome - currentExpense;
            const savingsRate = currentIncome > 0 ? Math.round((currentSavings / currentIncome) * 100) : 0;

            // Get Top 5 Categories
            const topCategories = (expensesByCategory || [])
                .slice(0, 5)
                .map((c: any) => `${c.category}: $${c.amount} (${c.percentage.toFixed(0)}%)`)
                .join(', ');

            // First context block removed to avoid redeclaration. We will assemble the full context later.

            // Fetch transactions for the current month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

            const transactions = await prisma.transaction.findMany({
                where: {
                    userId,
                    type: 'EXPENSE',
                    date: { gte: startOfMonth, lte: endOfMonth }
                },
                select: {
                    amount: true,
                    payee: true,
                    description: true,
                    categoryId: true,
                    account: { select: { name: true } }
                }
            });

            // 2.1 Group by Payee/Merchant (Normalized)
            const merchantStats: Record<string, { count: number; total: number }> = {};
            const categoryStats: Record<string, number> = {}; // Granular category totals

            // Cache for category names if we need them, but we might just use the summary's categories? 
            // The Summary service groups by Parent. User wants Subcategories. 
            // We need to resolve category names here if we want subcategories.
            // Let's resolve them in bulk.
            const uniqueCategoryIds = Array.from(new Set(transactions.map(t => t.categoryId).filter(Boolean))) as string[];
            const categoryTemplates = await prisma.categoryTemplate.findMany({
                where: { id: { in: uniqueCategoryIds } },
                select: { id: true, name: true }
            });
            const categoryNameMap = new Map(categoryTemplates.map(c => [c.id, c.name]));

            transactions.forEach(tx => {
                // Merchant Grouping
                let name = tx.payee || tx.description || 'Unknown';
                name = name.trim();

                if (!merchantStats[name]) merchantStats[name] = { count: 0, total: 0 };
                merchantStats[name].count++;
                merchantStats[name].total += Number(tx.amount);

                // Subcategory Grouping
                if (tx.categoryId) {
                    const catName = categoryNameMap.get(tx.categoryId) || 'Uncategorized';
                    if (!categoryStats[catName]) categoryStats[catName] = 0;
                    categoryStats[catName] += Number(tx.amount);
                }
            });

            // 2.2 Top Lists
            const topSpenders = Object.entries(merchantStats)
                .sort(([, a], [, b]) => b.total - a.total)
                .slice(0, 5)
                .map(([name, stats]) => ({ name, ...stats }));

            const topFrequent = Object.entries(merchantStats)
                .sort(([, a], [, b]) => b.count - a.count)
                .slice(0, 5)
                .map(([name, stats]) => ({ name, ...stats }));

            const topSubCategories = Object.entries(categoryStats)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10) // User requested Top 10
                .map(([name, total]) => ({ name, total }));

            // 3. Assemble Enhanced Context
            const context = {
                period: "Current Month",
                financials: {
                    income: currentIncome,
                    expenses: currentExpense,
                    savings_rate: `${savingsRate}%`
                },
                habits: {
                    top_merchants_by_amount: topSpenders,
                    top_merchants_by_frequency: topFrequent
                },
                breakdown: {
                    top_subcategories: topSubCategories,
                    top_tags: topTags.map((t: any) => ({ name: t.tagName, total: t.totalAmount }))
                }
            };

            // Call AI with Enhanced Prompt
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a financial advisor.
                        
                        Task:
                        1. Analyze the user's detailed financial context (Merchants, Habits, Categories).
                        2. GENERATE 5 DISTINCT, PERSONALIZED INSIGHTS.
                        3. Focus on specific habits (e.g., "You go to Starbucks too often") using the provided merchant data.
                        4. NEGATIVE CONSTRAINT: Do NOT repeat the "Existing Insights".
                        
                        Types: 'positive', 'warning', 'tip', 'achievement', 'challenge'.

                        Output JSON:
                        {
                            "insights": [
                                { "type": "...", "title": "...", "description": "..." }
                            ]
                        }
                        `
                    },
                    {
                        role: "user",
                        content: `User Context JSON:
                        ${JSON.stringify(context, null, 2)}
                        
                        Existing Insights (IGNORE):
                        ${heuristicInsights.map(h => `- ${h.title}`).join('\n')}

                        Generate 5 unique, personalized insights in Spanish.`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0.7,
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0]?.message?.content;
            if (!content) throw new Error("Empty AI response");

            const result = JSON.parse(content);
            const insightsList = result.insights || [];

            // Save to DB
            const savedInsights = [];
            for (const item of insightsList) {
                const saved = await prisma.aiInsight.create({
                    data: {
                        userId,
                        type: item.type || 'tip',
                        title: item.title || 'Consejo',
                        description: item.description || 'Descripcion no disponible',
                        date: new Date()
                    }
                });
                savedInsights.push(saved);
            }

            return savedInsights;

        } catch (error) {
            logger.error("Error generating AI insights:", error);
            return []; // Fail gracefully
        }
    }
}
