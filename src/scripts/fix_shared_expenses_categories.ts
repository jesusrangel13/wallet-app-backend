
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting Shared Expense Category Fix Script...');
    console.log('------------------------------------------------');

    // 1. Find all SharedExpenses that have NO category (categoryId is null)
    const uncategorizedExpenses = await prisma.sharedExpense.findMany({
        where: {
            categoryId: null
        },
        include: {
            group: true
        }
    });

    console.log(`🔍 Found ${uncategorizedExpenses.length} shared expenses without category.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const expense of uncategorizedExpenses) {
        // 2. Find a Transaction linked to this SharedExpense that HAS a category
        // We prioritize the transaction created by the payer (paidByUserId)
        const transaction = await prisma.transaction.findFirst({
            where: {
                sharedExpenseId: expense.id,
                categoryId: { not: null } // Must have a category
            },
            select: {
                categoryId: true,
                description: true
            }
        });

        if (transaction && transaction.categoryId) {
            // 3. Update the SharedExpense with this category
            await prisma.sharedExpense.update({
                where: { id: expense.id },
                data: {
                    categoryId: transaction.categoryId
                }
            });

            console.log(`✅ Fixed "${expense.description}" ($${expense.amount})`);
            console.log(`   -> Inherited Category ID: "${transaction.categoryId}" from Transaction`);
            updatedCount++;
        } else {
            console.log(`⚠️  Skipped "${expense.description}" ($${expense.amount})`);
            console.log(`   -> No linked transaction with category found.`);
            skippedCount++;
        }
    }

    console.log('------------------------------------------------');
    console.log('🎉 SCRIPT COMPLETE');
    console.log(`✅ Updated: ${updatedCount}`);
    console.log(`⚠️  Skipped: ${skippedCount}`);
    console.log('------------------------------------------------');
}

main()
    .catch((e) => {
        console.error('❌ Error executing script:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
