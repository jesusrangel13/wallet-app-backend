import { prisma } from '../utils/prisma';
import { SmartInsightsService } from '../services/smartInsights.service';
import { generateHeuristicInsights } from '../services/dashboard.service';
import logger from '../utils/logger';


const smartInsightsService = new SmartInsightsService();


/**
 * Run the batch process to generate daily insights for all users.
 */
export async function runBatchInsights() {
    logger.info("Starting Batch Insight Generation...");

    // 1. Fetch all users
    // Ideally, filter by active users (e.g., logged in last 30 days) to save tokens
    const users = await prisma.user.findMany({
        select: { id: true, email: true }
    });

    logger.info(`Found ${users.length} users to process.`);

    let processed = 0;
    let errors = 0;

    for (const user of users) {
        try {
            // 2. Generate Heuristics first (needed for AI context)
            const heuristics = await generateHeuristicInsights(user.id);

            // 3. Force Generation of AI Insights
            logger.info(`Processing user ${user.email} (${user.id})...`);
            const result = await smartInsightsService.generateDailyInsightsForBatch(user.id, heuristics);

            if (result && result.length > 0) {
                logger.info(`Generated ${result.length} insights for ${user.email}`);
            } else {
                logger.info(`No insights generated for ${user.email} (or already existed).`);
            }
            processed++;

            // Optional: Add small delay to avoid hitting Rate Limits if running for thousands of users
            // await new Promise(r => setTimeout(r, 1000)); 

        } catch (err) {
            logger.error(`Failed to process user ${user.email}`, err);
            errors++;
        }
    }

    logger.info(`Batch Complete. Processed: ${processed}, Errors: ${errors}`);
}

