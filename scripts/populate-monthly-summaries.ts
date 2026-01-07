
import { PrismaClient } from '@prisma/client';
import { updateMonthlySummary } from '../src/services/summary.service';

const prisma = new PrismaClient();

async function populateMonthlySummaries() {
    console.log('🚀 Starting monthly summary population...');
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users.`);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12); // Last 12 months

    for (const user of users) {
        console.log(`Processing user: ${user.name} (${user.email})`);

        // Iterate through each month from start date to now
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const month = currentDate.getMonth();
            const year = currentDate.getFullYear();

            console.log(`  - Updating summary for ${month + 1}/${year}...`);
            try {
                await updateMonthlySummary(user.id, currentDate);
            } catch (error) {
                console.error(`  ❌ Failed to update summary for ${month + 1}/${year}:`, error);
            }

            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }

    console.log('✅ Monthly summary population complete!');
    await prisma.$disconnect();
}

populateMonthlySummaries().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
