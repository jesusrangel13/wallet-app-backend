import Groq from 'groq-sdk';
import { ContextAssemblyService } from './contextAssembly.service';
import { SmartMatcherService } from './smartMatcher.service';
import currency from 'currency.js';
import logger from '../../utils/logger';
import { env } from '../../config/env';
const Sugar = require('sugar-date');
require('sugar-date/locales/es'); // Import Spanish locale

const groq = new Groq({ apiKey: env.GROQ_API_KEY });
const contextService = new ContextAssemblyService();
const smartMatcher = new SmartMatcherService();

// Define the interface for the parser result
interface ParsedResult {
    amount: number;
    currency: string;
    merchant: string | null;
    description: string | null; // Added description
    category: string | null;
    date: Date;
    confidence: number;
    originalText: string;
    resolvedCategoryId?: string;
    resolvedAccountId?: string;
    accountName?: string;
    tags?: string[];
    resolvedTagIds?: string[];
    groupName?: string | null;
    resolvedGroupId?: string;
}

export class VoiceTransactionService {

    async parseTransaction(userId: string, text: string): Promise<ParsedResult> {
        // Set locale to Spanish for this request
        Sugar.Date.setLocale('es');

        // 1. Get Context (Resilient)
        let context: any;
        try {
            context = await contextService.getUserContext(userId);
        } catch (error) {
            logger.warn("⚠️ Failed to retrieve user context (DB might be down). Proceeding with default context.", error);
            context = {
                current_date: new Date().toISOString(),
                currency_preference: 'USD', // Fallback
                categories: [],
                recent_payees: [],
                available_tags: []
            };
        }

        // 2. Call AI parsing
        const aiResponse = await this.callAI(text, context);

        // 3. Resolve Entities
        let resolvedDate = new Date();
        if (aiResponse.date_expression) {
            // Use Sugar Date to parse natural language dates (e.g. "ayer", "el viernes")
            // "past: true" preference ensures "Friday" means "Last Friday" if ambiguous, 
            // though Sugar handles "last friday" explicitly.
            const parsed = Sugar.Date.create(aiResponse.date_expression, { from: new Date() });
            if (Sugar.Date.isValid(parsed)) {
                resolvedDate = parsed;
            }
        }

        let resolvedCategoryId = undefined;
        let resolvedAccountId = undefined;
        let resolvedTagIds: string[] = [];

        // Resolve Category
        if (aiResponse.category) {
            try {
                const match = await smartMatcher.matchCategory(userId, aiResponse.category);
                if (match) {
                    resolvedCategoryId = match.id;
                }
            } catch (error) {
                logger.warn("⚠️ Failed to resolve category via SmartMatcher (DB might be down). Ignoring.", error);
            }
        }

        // Resolve Account
        if (aiResponse.account_source) {
            try {
                const match = await smartMatcher.matchAccount(userId, aiResponse.account_source);
                if (match) {
                    resolvedAccountId = match.id;
                }
            } catch (error) {
                logger.warn("⚠️ Failed to resolve account via SmartMatcher. Ignoring.", error);
            }
        }

        // Resolve Tags
        if (aiResponse.tags && Array.isArray(aiResponse.tags)) {
            try {
                resolvedTagIds = await smartMatcher.matchTags(userId, aiResponse.tags);
            } catch (error) {
                logger.warn("⚠️ Failed to resolve tags via SmartMatcher. Ignoring.", error);
            }
        }

        // Resolve Group
        let resolvedGroupId = undefined;
        if (aiResponse.group_name) {
            try {
                const match = await smartMatcher.matchGroup(userId, aiResponse.group_name);
                if (match) {
                    resolvedGroupId = match.id;
                }
            } catch (error) {
                logger.warn("⚠️ Failed to resolve group via SmartMatcher. Ignoring.", error);
            }
        }

        return {
            amount: aiResponse.amount,
            currency: aiResponse.currency || context.currency_preference,
            merchant: aiResponse.merchant,
            description: aiResponse.description || aiResponse.category, // Fallback to category
            category: aiResponse.category,  // Raw category from AI
            resolvedCategoryId: resolvedCategoryId, // Real DB ID

            accountName: aiResponse.account_source,
            resolvedAccountId: resolvedAccountId,

            date: resolvedDate,
            confidence: aiResponse.confidence,
            originalText: text,

            tags: aiResponse.tags || [],
            resolvedTagIds: resolvedTagIds,
            groupName: aiResponse.group_name || null,
            resolvedGroupId: resolvedGroupId
        };
    }

    private async callAI(text: string, context: any): Promise<any> {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a financial transaction parser. Extract structured data from the user input (in Spanish).
                    
                    User Context:
                    ${JSON.stringify(context)}
                    
                    Instructions:
                    1. **Description**: What was bought? (e.g. "Frutas", "Café"). Extract this separately from merchant.
                    2. **Payee/Merchant**: Where was it bought? (e.g. "Feria", "Starbucks", "Jumbo"). Look for "en [Place]", "de [Brand]".
                    3. **Tags**: Match against 'available_tags' or extract hashtags like "#viaje". Return as array of strings.
                    4. **Date**: Extract time reference relative to ${context.current_date}. Return "ayer", "hace 3 días", "el viernes pasado" exactly as captured or normalized to a string SugarDate can parse in Spanish.
                    5. **Category**: Try to match specific subcategories in 'active_categories' (e.g. use "Cafetería" instead of just "Comida").
                    6. **Shared/Group**: Look for phrases like "del grupo [Group]", "compartido con [Group]", "compra de la [Group]", "para la [Group]", "en la [Group]". Match against 'available_groups'.
                    
                    Return a JSON object with:
                    - amount: number
                    - currency: string (ISO code)
                    - merchant: string (or null)
                    - description: string (Item bought)
                    - category: string (best guess)
                    - account_source: string (source account mentioned or null)
                    - date_expression: string (time reference or null)
                    - tags: string[] (array of strings)
                    - group_name: string (target group name if shared, or null)
                    - confidence: number (0.0 to 1.0)
                    
                    Respond ONLY with valid JSON.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                model: "llama-3.3-70b-versatile",
                temperature: 0,
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0]?.message?.content;
            if (!content) throw new Error("Empty response from AI");
            return JSON.parse(content);
        } catch (error) {
            logger.error("AI Parsing Error:", error);
            // Fallback or re-throw
            throw new Error("Failed to parse transaction via AI");
        }
    }
}
