
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupMonthZero() {
    console.log('🧹 Starting cleanup of Month 0 records...');

    // Find all records with month 0
    const invalidRecords = await prisma.monthlySummary.findMany({
        where: { month: 0 },
    });

    console.log(`Found ${invalidRecords.length} records with Month 0.`);

    if (invalidRecords.length === 0) {
        console.log('✅ No invalid records found.');
        await prisma.$disconnect();
        return;
    }

    // Delete them
    const result = await prisma.monthlySummary.deleteMany({
        where: { month: 0 },
    });

    console.log(`✅ Deleted ${result.count} invalid records.`);
    await prisma.$disconnect();
}

cleanupMonthZero().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
