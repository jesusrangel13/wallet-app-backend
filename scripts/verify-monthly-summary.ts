
import { PrismaClient, TransactionType } from '@prisma/client';
import { createTransaction, updateTransaction, deleteTransaction } from '../src/services/transaction.service';

const prisma = new PrismaClient();

async function verifyMonthlySummary() {
    console.log('🧪 Starting Monthly Summary Verification...');

    // 1. Get a test user
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error('❌ No user found for verification.');
        return;
    }
    console.log(`👤 Using user: ${user.name} (${user.id})`);

    // 2. Get/Create an account
    let account = await prisma.account.findFirst({ where: { userId: user.id } });
    if (!account) {
        account = await prisma.account.create({
            data: {
                userId: user.id,
                name: 'Test Account',
                type: 'CASH',
                currency: 'USD',
                balance: 0
            }
        });
        console.log('  - Created test account');
    }

    // 3. Get initial summary state
    const date = new Date();
    const month = date.getMonth();
    const year = date.getFullYear();

    const initialSummary = await prisma.monthlySummary.findUnique({
        where: { userId_month_year: { userId: user.id, month: month + 1, year } }
    });
    const initialIncome = Number(initialSummary?.income || 0);
    console.log(`  - Initial Income: $${initialIncome}`);

    // 4. Create Transaction (Income +$1000)
    console.log('🔄 Creating Transaction (Income $1000)...');
    const transaction = await createTransaction(user.id, {
        accountId: account.id,
        type: 'INCOME',
        amount: 1000,
        description: 'Test Income Verification',
        date: date.toISOString(),
        categoryId: undefined // No category to keep it simple or default
    });

    // Verify
    const afterCreateSummary = await prisma.monthlySummary.findUnique({
        where: { userId_month_year: { userId: user.id, month: month + 1, year } }
    });
    const afterCreateIncome = Number(afterCreateSummary?.income || 0);
    console.log(`  - Income after create: $${afterCreateIncome}`);

    if (afterCreateIncome !== initialIncome + 1000) {
        console.error(`❌ Verification Failed: Income expected ${initialIncome + 1000}, got ${afterCreateIncome}`);
    } else {
        console.log('✅ Create Transaction Verification Passed');
    }

    // 5. Update Transaction (Change to $2000)
    console.log('🔄 Updating Transaction (Change to $2000)...');
    await updateTransaction(user.id, transaction.id, {
        amount: 2000
    });

    // Verify
    const afterUpdateSummary = await prisma.monthlySummary.findUnique({
        where: { userId_month_year: { userId: user.id, month: month + 1, year } }
    });
    const afterUpdateIncome = Number(afterUpdateSummary?.income || 0);
    console.log(`  - Income after update: $${afterUpdateIncome}`);

    if (afterUpdateIncome !== initialIncome + 2000) {
        console.error(`❌ Verification Failed: Income expected ${initialIncome + 2000}, got ${afterUpdateIncome}`);
    } else {
        console.log('✅ Update Transaction Verification Passed');
    }

    // 6. Delete Transaction
    console.log('🗑️ Deleting Transaction...');
    await deleteTransaction(user.id, transaction.id);

    // Verify
    const afterDeleteSummary = await prisma.monthlySummary.findUnique({
        where: { userId_month_year: { userId: user.id, month: month + 1, year } }
    });
    const afterDeleteIncome = Number(afterDeleteSummary?.income || 0);
    console.log(`  - Income after delete: $${afterDeleteIncome}`);

    if (afterDeleteIncome !== initialIncome) {
        console.error(`❌ Verification Failed: Income expected ${initialIncome}, got ${afterDeleteIncome}`);
    } else {
        console.log('✅ Delete Transaction Verification Passed');
    }

    console.log('🎉 Verification Complete!');
    await prisma.$disconnect();
}

verifyMonthlySummary().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
