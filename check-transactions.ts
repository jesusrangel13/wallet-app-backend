import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTransactions() {
  console.log('\n=== Checking Transactions ===\n');

  // Count all transactions
  const totalTransactions = await prisma.transaction.count();
  console.log(`📊 Total Transactions: ${totalTransactions}`);

  // Count transactions with sharedExpenseId
  const sharedTransactions = await prisma.transaction.count({
    where: {
      sharedExpenseId: {
        not: null,
      },
    },
  });
  console.log(`🤝 Transactions with Shared Expense: ${sharedTransactions}`);

  // Get sample transactions
  if (totalTransactions > 0) {
    console.log('\n=== Sample Transactions (first 10) ===\n');
    const transactions = await prisma.transaction.findMany({
      take: 10,
      include: {
        account: {
          select: {
            name: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
        sharedExpense: true,
      },
      orderBy: {
        date: 'desc',
      },
    });

    transactions.forEach((tx, idx) => {
      console.log(`\nTransaction ${idx + 1}:`);
      console.log(`  ID: ${tx.id}`);
      console.log(`  Type: ${tx.type}`);
      console.log(`  Amount: ${tx.amount}`);
      console.log(`  Description: ${tx.description || 'N/A'}`);
      console.log(`  Account: ${tx.account.name}`);
      console.log(`  Category: ${tx.category?.name || 'N/A'}`);
      console.log(`  Date: ${tx.date.toISOString().split('T')[0]}`);
      console.log(`  Has Shared Expense: ${tx.sharedExpenseId ? 'YES' : 'NO'}`);
      if (tx.sharedExpense) {
        console.log(`  Shared Expense Amount: ${tx.sharedExpense.amount}`);
      }
    });
  }

  await prisma.$disconnect();
}

checkTransactions().catch(console.error);
