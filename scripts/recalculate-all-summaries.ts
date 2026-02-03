
import { PrismaClient } from '@prisma/client';
import { updateMonthlySummary } from '../src/services/summary.service';

const prisma = new PrismaClient();

async function recalculateAllSummaries() {
    console.log('🚀 Starting FULL monthly summary recalculation...');

    // Get all users
    const users = await prisma.user.findMany({
        select: { id: true, name: true, email: true }
    });
    console.log(`Found ${users.length} users.`);

    for (const user of users) {
        console.log(`\nProcessing user: ${user.name} (${user.email})`);

        // Find min and max transaction date for this user to determine range
        const aggregate = await prisma.transaction.aggregate({
            where: { userId: user.id },
            _min: { date: true },
            _max: { date: true }
        });

        if (!aggregate._min.date || !aggregate._max.date) {
            console.log('  - No transactions found, skipping.');
            continue;
        }

        const startDate = new Date(aggregate._min.date);
        const endDate = new Date(aggregate._max.date);
        // Ensure we cover the full current month even if last transaction was days ago
        const now = new Date();
        if (endDate < now) {
            endDate.setMonth(now.getMonth());
            endDate.setFullYear(now.getFullYear());
        }

        // Normalize start date to 1st of month
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);

        console.log(`  - Date Range: ${startDate.toISOString().slice(0, 7)} to ${endDate.toISOString().slice(0, 7)}`);

        // Iterate through each month
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const month = currentDate.getMonth(); // 0-indexed
            const year = currentDate.getFullYear();

            // Progress log (optional, maybe too verbose for large history)
            // console.log(`    > Updating ${month + 1}/${year}...`); 

            try {
                // Pass the date. updateMonthlySummary logic handles finding start/end of month.
                // NOTE: We recently fixed updateMonthlySummary to include the full last day of month.
                await updateMonthlySummary(user.id, currentDate);
                process.stdout.write('.'); // Compact progress bar
            } catch (error) {
                console.error(`\n    ❌ Failed to update summary for ${month + 1}/${year}:`, error);
            }

            // Move to next month safely
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        console.log(''); // New line after dots
    }

    console.log('\n✅ Full recalculation complete!');
}

recalculateAllSummaries()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
