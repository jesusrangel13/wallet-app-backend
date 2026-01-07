import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TransactionLink {
  transactionId: string;
  description: string;
  amount: number;
  type: string;
  userId: string;
  userName: string;
  sharedExpenseId: string;
  sharedExpenseDescription: string;
}

/**
 * Script to link historical settlement transactions to their shared expenses
 *
 * This fixes the double-counting issue where settlement transactions were not
 * linked to shared expenses, causing them to appear in "Personal Expenses" widget.
 *
 * The script identifies transactions based on:
 * 1. Category: "Pago de deuda" (EXPENSE) or "Cobro de deuda" (INCOME)
 * 2. Description patterns that match shared expense settlements
 * 3. Currently unlinked (sharedExpenseId = null)
 *
 * It then attempts to match them to their corresponding SharedExpense records.
 */
async function linkSharedExpenseTransactions() {
  console.log('🔄 Starting shared expense transaction linking...\n');

  try {
    // Step 1: Find the debt payment categories
    console.log('📋 Step 1: Finding debt payment categories...');
    const [debtPaymentCategory, debtCollectionCategory] = await Promise.all([
      prisma.categoryTemplate.findFirst({
        where: {
          name: 'Pago de deuda',
          type: 'EXPENSE',
        },
      }),
      prisma.categoryTemplate.findFirst({
        where: {
          name: 'Cobro de deuda',
          type: 'INCOME',
        },
      }),
    ]);

    if (!debtPaymentCategory && !debtCollectionCategory) {
      console.log('⚠️  No debt payment categories found. Nothing to migrate.');
      return;
    }

    console.log(`   ✓ Found "Pago de deuda": ${debtPaymentCategory ? 'Yes' : 'No'}`);
    console.log(`   ✓ Found "Cobro de deuda": ${debtCollectionCategory ? 'Yes' : 'No'}\n`);

    // Step 2: Find all unlinked transactions with these categories
    console.log('📋 Step 2: Finding unlinked settlement transactions...');

    const categoryIds = [
      debtPaymentCategory?.id,
      debtCollectionCategory?.id,
    ].filter(Boolean) as string[];

    const unlinkTransactions = await prisma.transaction.findMany({
      where: {
        categoryId: { in: categoryIds },
        sharedExpenseId: null, // Only unlinked transactions
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    console.log(`   ✓ Found ${unlinkTransactions.length} unlinked settlement transactions\n`);

    if (unlinkTransactions.length === 0) {
      console.log('✅ All settlement transactions are already linked!');
      return;
    }

    // Step 3: Get all shared expenses for matching
    console.log('📋 Step 3: Loading shared expenses for matching...');
    const sharedExpenses = await prisma.sharedExpense.findMany({
      include: {
        participants: true,
        paidBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    console.log(`   ✓ Loaded ${sharedExpenses.length} shared expenses\n`);

    // Step 4: Attempt to match and link transactions
    console.log('📋 Step 4: Matching and linking transactions...\n');

    const linkedTransactions: TransactionLink[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const tx of unlinkTransactions) {
      console.log(`\n🔍 Processing transaction ${tx.id}`);
      console.log(`   Type: ${tx.type}`);
      console.log(`   Amount: $${Number(tx.amount).toFixed(0)}`);
      console.log(`   Description: "${tx.description}"`);
      console.log(`   Date: ${tx.date.toISOString().split('T')[0]}`);
      console.log(`   User: ${tx.user.name}`);

      // Extract shared expense description from transaction description
      // Patterns:
      // - "Pago a {name} por "{description}""
      // - "Recibido de {name} por "{description}""
      // - "Pago de balance compartido a {name}."
      // - "Recibido de {name} por balance compartido."

      let matchedExpense = null;
      const amount = Number(tx.amount);
      const dateTolerance = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      // Try to extract expense description from transaction description
      const descriptionMatch = tx.description?.match(/por "([^"]+)"/);

      if (descriptionMatch) {
        // Match by description and amount
        const expenseDescription = descriptionMatch[1];
        console.log(`   🔎 Searching for expense: "${expenseDescription}"`);

        matchedExpense = sharedExpenses.find((expense) => {
          const descMatch = expense.description === expenseDescription;
          const dateMatch = Math.abs(expense.date.getTime() - tx.date.getTime()) < dateTolerance;

          // For individual participant payments, match the exact amount owed
          const participantMatch = expense.participants.find(
            (p) => Math.abs(Number(p.amountOwed) - amount) < 0.01
          );

          return descMatch && dateMatch && participantMatch;
        });
      } else if (tx.description?.includes('balance compartido')) {
        // Match by amount and date for settle-all transactions
        console.log(`   🔎 Searching for shared expenses by amount and date`);

        matchedExpense = sharedExpenses.find((expense) => {
          const dateMatch = Math.abs(expense.date.getTime() - tx.date.getTime()) < dateTolerance;

          // For settle-all, we look for any participant with matching amount
          const participantMatch = expense.participants.find(
            (p) => Math.abs(Number(p.amountOwed) - amount) < 0.01
          );

          return dateMatch && participantMatch;
        });
      }

      if (matchedExpense) {
        console.log(`   ✅ Match found! Shared expense: "${matchedExpense.description}"`);
        console.log(`      Expense ID: ${matchedExpense.id}`);
        console.log(`      Expense amount: $${Number(matchedExpense.amount).toFixed(0)}`);
        console.log(`      Paid by: ${matchedExpense.paidBy.name}`);

        // Update transaction to link it to the shared expense
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { sharedExpenseId: matchedExpense.id },
        });

        linkedTransactions.push({
          transactionId: tx.id,
          description: tx.description || '',
          amount: Number(tx.amount),
          type: tx.type,
          userId: tx.userId,
          userName: tx.user.name,
          sharedExpenseId: matchedExpense.id,
          sharedExpenseDescription: matchedExpense.description,
        });

        successCount++;
        console.log(`   ✅ Transaction linked successfully!`);
      } else {
        console.log(`   ⚠️  No matching shared expense found`);
        failureCount++;
      }
    }

    // Print summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 TRANSACTION LINKING SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Total transactions processed: ${unlinkTransactions.length}`);
    console.log(`🔗 Successfully linked: ${successCount}`);
    console.log(`⚠️  Could not link: ${failureCount}`);

    if (linkedTransactions.length > 0) {
      console.log('\n\n🔗 LINKED TRANSACTIONS:\n');

      // Group by user
      const byUser = linkedTransactions.reduce((acc, link) => {
        if (!acc[link.userId]) {
          acc[link.userId] = {
            userName: link.userName,
            transactions: [],
          };
        }
        acc[link.userId].transactions.push(link);
        return acc;
      }, {} as Record<string, { userName: string; transactions: TransactionLink[] }>);

      Object.values(byUser).forEach((userData) => {
        console.log(`👤 ${userData.userName}:`);
        userData.transactions.forEach((link) => {
          console.log(`   📌 ${link.type}: $${link.amount.toFixed(0)}`);
          console.log(`      Transaction: "${link.description}"`);
          console.log(`      Linked to: "${link.sharedExpenseDescription}"`);
          console.log('');
        });
      });

      console.log(`💰 TOTAL AMOUNT LINKED: $${linkedTransactions.reduce((sum, t) => sum + t.amount, 0).toFixed(0)}`);
    }

    if (failureCount > 0) {
      console.log('\n⚠️  UNMATCHED TRANSACTIONS:');
      console.log('   These transactions could not be automatically matched to shared expenses.');
      console.log('   They may need manual review or the matching shared expense may not exist.');
      console.log(`   Count: ${failureCount}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Transaction linking completed successfully!');
    console.log('='.repeat(80) + '\n');

    console.log('📝 NEXT STEPS:');
    console.log('   1. Restart your backend server to apply changes');
    console.log('   2. Check the "Personal Expenses" and "Shared Expenses" widgets');
    console.log('   3. Verify the amounts are now correct');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during transaction linking:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
linkSharedExpenseTransactions()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
