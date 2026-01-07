
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspectMonthlySummaries() {
    console.log('🔍 Inspecting MonthlySummary table...');

    // Get all summaries
    const summaries = await prisma.monthlySummary.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    console.log(`Found ${summaries.length} summaries.`);

    if (summaries.length > 0) {
        console.log('--- Latest Summaries ---');
        summaries.forEach(s => {
            console.log(`ID: ${s.id}`);
            console.log(`User: ${s.userId}`);
            console.log(`Month/Year: ${s.month}/${s.year}`);
            console.log(`Income: ${s.income}`);
            console.log(`Expense: ${s.expense}`);
            console.log(`Personal: ${s.personalExpense}`);
            console.log(`Shared: ${s.sharedExpense}`);
            console.log(`Savings: ${s.savings}`);
            console.log('-------------------------');
        });
    }

    // Check specifically for January 2026 (Month 1? or 0?)
    // Check for Month 0 just in case
    const zeroMonth = await prisma.monthlySummary.findFirst({
        where: { month: 0, year: 2026 }
    });
    if (zeroMonth) {
        console.log('⚠️ FOUND A RECORD WITH MONTH 0!');
        console.log(zeroMonth);
    }

    const firstMonth = await prisma.monthlySummary.findFirst({
        where: { month: 1, year: 2026 }
    });
    if (firstMonth) {
        console.log('✅ Found a record with Month 1 (January)');
        console.log(firstMonth);
    }

    await prisma.$disconnect();
}

inspectMonthlySummaries().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
