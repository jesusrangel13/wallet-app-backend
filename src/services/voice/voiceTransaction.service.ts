import Groq from 'groq-sdk';
import { ContextAssemblyService } from './contextAssembly.service';
import { SmartMatcherService } from './smartMatcher.service';
import currency from 'currency.js';
const Sugar = require('sugar-date');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const contextService = new ContextAssemblyService();
const smartMatcher = new SmartMatcherService();

// Define the interface for the parser result
interface ParsedResult {
    amount: number;
    currency: string;
    merchant: string | null;
    category: string | null;
    date: Date;
    confidence: number;
    originalText: string;
    resolvedCategoryId?: string;
    resolvedAccountId?: string;
    accountName?: string;
}

export class VoiceTransactionService {

    async parseTransaction(userId: string, text: string): Promise<ParsedResult> {
        // 1. Get Context (Resilient)
        let context: any;
        try {
            context = await contextService.getUserContext(userId);
        } catch (error) {
            console.warn("⚠️ Failed to retrieve user context (DB might be down). Proceeding with default context.", error);
            context = {
                current_date: new Date().toISOString(),
                currency_preference: 'USD', // Fallback
                categories: [],
                recent_payees: []
            };
        }

        // 2. Call AI parsing
        const aiResponse = await this.callAI(text, context);

        // 3. Resolve Entities
        let resolvedDate = new Date();
        if (aiResponse.date_expression) {
            // Use Sugar Date to parse natural language dates (e.g. "ayer", "el viernes")
            const parsed = Sugar.Date.create(aiResponse.date_expression);
            if (Sugar.Date.isValid(parsed)) {
                resolvedDate = parsed;
            }
        }

        let resolvedCategoryId = undefined;
        let resolvedAccountId = undefined;

        // Resolve Category
        if (aiResponse.category) {
            try {
                const match = await smartMatcher.matchCategory(userId, aiResponse.category);
                if (match) {
                    resolvedCategoryId = match.id;
                }
            } catch (error) {
                console.warn("⚠️ Failed to resolve category via SmartMatcher (DB might be down). Ignoring.", error);
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
                console.warn("⚠️ Failed to resolve account via SmartMatcher. Ignoring.", error);
            }
        }

        return {
            amount: aiResponse.amount,
            currency: aiResponse.currency || context.currency_preference,
            merchant: aiResponse.merchant,
            category: aiResponse.category,  // Raw category from AI
            resolvedCategoryId: resolvedCategoryId, // Real DB ID

            accountName: aiResponse.account_source,
            resolvedAccountId: resolvedAccountId,

            date: resolvedDate,
            confidence: aiResponse.confidence,
            originalText: text
        };
    }

    private async callAI(text: string, context: any): Promise<any> {
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a financial transaction parser. Extract structured data from the user input.
                    
                    User Context:
                    ${JSON.stringify(context)}
                    
                    Return a JSON object with:
                    - amount: number
                    - currency: string (ISO code)
                    - merchant: string (or null)
                    - category: string (best guess based on input or active_categories)
                    - account_source: string (source account mentioned e.g. "santander", "cash", or null)
                    - date_expression: string (extract time reference like "ayer", "hoy", "last friday", or null if not present)
                    - confidence: number (0.0 to 1.0)
                    
                    Respond ONLY with valid JSON.`
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                model: "llama-3.3-70b-versatile", // Updated from decommissioned llama3-70b-8192
                temperature: 0,
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0]?.message?.content;
            if (!content) throw new Error("Empty response from AI");
            return JSON.parse(content);
        } catch (error) {
            console.error("AI Parsing Error:", error);
            // Fallback or re-throw
            throw new Error("Failed to parse transaction via AI");
        }
    }
}
