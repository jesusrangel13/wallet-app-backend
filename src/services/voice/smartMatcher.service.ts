import { prisma } from '../../utils/prisma';

export class SmartMatcherService {

    /**
     * Simple Levenshtein distance implementation
     */
    private levenshtein(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1  // deletion
                        )
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Learn a correction/pattern from a user transaction.
     */
    async learn(userId: string, originalText: string, categoryId: string, resolvedMerchant?: string) {
        if (!originalText || !categoryId) return;

        const pattern = originalText.toLowerCase().trim();

        try {
            // Upsert the pattern
            await prisma.userTransactionPattern.upsert({
                where: {
                    userId_pattern: {
                        userId,
                        pattern
                    }
                },
                update: {
                    resolvedCategoryId: categoryId,
                    resolvedMerchant: resolvedMerchant || null,
                    useCount: { increment: 1 },
                    confidence: 1.0 // Confirmed by user
                },
                create: {
                    userId,
                    pattern,
                    resolvedCategoryId: categoryId,
                    resolvedMerchant: resolvedMerchant || null,
                    confidence: 1.0
                }
            });
        } catch (error) {
            console.error('Failed to learn pattern:', error);
        }
    }

    /**
     * Find the best match for a category name among user's active categories.
     * NOW INCLUDES PATTERN MATCHING.
     */
    async matchCategory(userId: string, inputName: string): Promise<{ id: string, name: string, confidence: number } | null> {
        if (!inputName) return null;
        const normalizedInput = inputName.toLowerCase().trim();

        // 0. Check for exact learned patterns first
        const pattern = await prisma.userTransactionPattern.findFirst({
            where: {
                userId,
                pattern: normalizedInput
            },
        });

        if (pattern && pattern.resolvedCategoryId) {
            // Fetch category name
            // Try templates first
            const template = await prisma.categoryTemplate.findUnique({
                where: { id: pattern.resolvedCategoryId },
                select: { name: true }
            });

            if (template) {
                return { id: pattern.resolvedCategoryId, name: template.name, confidence: 1.0 };
            }

            // Try overrides
            const override = await prisma.userCategoryOverride.findUnique({
                where: { id: pattern.resolvedCategoryId },
                select: { name: true }
            });

            if (override) {
                return { id: pattern.resolvedCategoryId, name: override.name, confidence: 1.0 };
            }
        }

        // 1. Fetch all candidates (Templates + Overrides)
        // In a real app we might cache this or optimize the query.
        const categoryTemplates = await prisma.categoryTemplate.findMany({
            select: { id: true, name: true }
        });
        const userOverrides = await prisma.userCategoryOverride.findMany({
            where: { userId, isActive: true },
            select: { id: true, name: true, templateId: true }
        });

        // Create a unified list of candidates
        // Prefer user overrides if they exist
        const candidates = categoryTemplates.map(t => {
            const override = userOverrides.find(o => o.templateId === t.id);
            if (override) {
                return { id: override.id, name: override.name, source: 'override' };
            }
            return { id: t.id, name: t.name, source: 'template' };
        });

        // Also include custom overrides that don't map to a template? 
        const customCategories = await prisma.userCategoryOverride.findMany({
            where: { userId, isActive: true, templateId: null },
            select: { id: true, name: true }
        });

        candidates.push(...customCategories.map(c => ({ id: c.id, name: c.name, source: 'custom' })));

        let bestMatch = null;
        let minDistance = Infinity;

        for (const candidate of candidates) {
            const dist = this.levenshtein(normalizedInput, candidate.name.toLowerCase());
            if (dist < minDistance) {
                minDistance = dist;
                bestMatch = candidate;
            }
        }

        // Calculate confidence score (0 to 1)
        const maxLength = Math.max(normalizedInput.length, bestMatch?.name.length || 1);
        const confidence = 1 - (minDistance / maxLength);

        if (bestMatch && confidence > 0.4) { // Threshold
            return {
                id: bestMatch.id,
                name: bestMatch.name,
                confidence
            };
        }

        return null;
    }

    /**
     * Fuzzy match an account name
     */
    async matchAccount(userId: string, inputName: string): Promise<{ id: string, name: string, confidence: number } | null> {
        if (!inputName) return null;
        const normalizedInput = inputName.toLowerCase().trim();

        const accounts = await prisma.account.findMany({
            where: { userId },
            select: { id: true, name: true }
        });

        let bestMatch = null;
        let minDistance = Infinity;

        for (const account of accounts) {
            // Match against name
            const distName = this.levenshtein(normalizedInput, account.name.toLowerCase());

            if (distName < minDistance) {
                minDistance = distName;
                bestMatch = account;
            }
        }

        if (!bestMatch) return null;

        const maxLength = Math.max(normalizedInput.length, bestMatch.name.length);
        const confidence = 1 - (minDistance / maxLength);

        if (confidence > 0.4) {
            return { id: bestMatch.id, name: bestMatch.name, confidence };
        }

        return null;
    }

    /**
     * Fuzzy match tags
     */
    async matchTags(userId: string, inputTags: string[]): Promise<string[]> {
        if (!inputTags || inputTags.length === 0) return [];

        const existingTags = await prisma.tag.findMany({
            where: { userId },
            select: { id: true, name: true }
        });

        const matchedTagIds: string[] = [];

        for (const inputTag of inputTags) {
            const normalizedInput = inputTag.toLowerCase().trim();
            let bestMatch = null;
            let minDistance = Infinity;

            for (const tag of existingTags) {
                const dist = this.levenshtein(normalizedInput, tag.name.toLowerCase());
                if (dist < minDistance) {
                    minDistance = dist;
                    bestMatch = tag;
                }
            }

            if (bestMatch) {
                const maxLength = Math.max(normalizedInput.length, bestMatch.name.length);
                const confidence = 1 - (minDistance / maxLength);

                if (confidence > 0.6) { // Higher threshold for tags
                    matchedTagIds.push(bestMatch.id);
                }
            }
        }

        return [...new Set(matchedTagIds)]; // Unique IDs
    }
}
