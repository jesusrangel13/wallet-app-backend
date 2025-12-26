import cron from 'node-cron';
import { priceProviderService } from '../services/price-provider.service';

/**
 * Iniciar trabajos programados (cron jobs) para inversiones
 */
export const startInvestmentCronJobs = () => {
  // Limpiar caché de precios antiguo todos los días a las 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('[Cron] Running daily price cache cleanup...');
    try {
      await priceProviderService.cleanOldCache();
      console.log('[Cron] Price cache cleanup completed successfully');
    } catch (error) {
      console.error('[Cron] Price cache cleanup failed:', error);
    }
  });

  console.log('✅ Investment cron jobs initialized');
};
