import cron from 'node-cron';
import logger from './utils/logger';
import { runBatchInsights } from './cron/generateDailyInsights';

/**
 * Initialize all internal cron jobs.
 * This function should be called when the server starts.
 */
export const initCronJobs = () => {
    logger.info("Initializing Internal Cron Jobs...");

    // Schedule Daily Insights Generation to run at 1:00 AM every day
    // Format: Minute Hour Day Month DayOfWeek
    cron.schedule('0 1 * * *', async () => {
        logger.info('Running Scheduled Task: Daily Insights Generation');
        try {
            await runBatchInsights();
        } catch (error) {
            logger.error('Error in Scheduled Task: Daily Insights Generation', error);
        }
    });

    logger.info("Cron Jobs Initialized: [Daily Insights at 01:00 AM]");
};
