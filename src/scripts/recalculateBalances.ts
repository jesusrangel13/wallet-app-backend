import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BalanceCorrection {
  accountId: string;
  accountName: string;
  accountType: string;
  currency: string;
  currentBalance: number;
  calculatedBalance: number;
  difference: number;
  transactionCount: number;
}

/**
 * Script to recalculate account balances based on all transactions
 * This fixes any discrepancies caused by imported transactions that didn't update balances
 */
async function recalculateAccountBalances() {
  console.log('🔄 Starting balance recalculation...\n');

  try {
    // Get all accounts
    const accounts = await prisma.account.findMany({
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: [{ userId: 'asc' }, { name: 'asc' }],
    });

    console.log(`📊 Found ${accounts.length} accounts to process\n`);

    const corrections: BalanceCorrection[] = [];
    let totalAccountsUpdated = 0;

    for (const account of accounts) {
      console.log(`\n🔍 Processing: ${account.name} (${account.type})`);
      console.log(`   Owner: ${account.user.name} (${account.user.email})`);
      console.log(`   Currency: ${account.currency}`);

      // Get all transactions for this account
      const transactions = await prisma.transaction.findMany({
        where: {
          OR: [
            { accountId: account.id },
            { toAccountId: account.id }, // For transfers TO this account
          ],
        },
        orderBy: { date: 'asc' },
      });

      console.log(`   📝 Found ${transactions.length} transactions`);

      // Calculate what the balance SHOULD be
      let calculatedBalance = 0;

      // For CREDIT cards, start from the credit limit (available credit)
      if (account.type === 'CREDIT' && account.creditLimit) {
        calculatedBalance = Number(account.creditLimit);
      }

      for (const tx of transactions) {
        const amount = Number(tx.amount);

        if (tx.accountId === account.id) {
          // Transaction FROM this account
          if (account.type === 'CREDIT') {
            // Credit cards: expenses reduce available credit, income increases it
            if (tx.type === 'INCOME') {
              calculatedBalance += amount;
            } else {
              // EXPENSE or TRANSFER out
              calculatedBalance -= amount;
            }
          } else {
            // Debit/Cash: income increases balance, expense/transfer decreases
            if (tx.type === 'INCOME') {
              calculatedBalance += amount;
            } else {
              calculatedBalance -= amount;
            }
          }
        } else if (tx.toAccountId === account.id) {
          // Transfer TO this account (always increases balance)
          if (account.type === 'CREDIT') {
            calculatedBalance += amount;
          } else {
            calculatedBalance += amount;
          }
        }
      }

      const currentBalance = Number(account.balance);
      const difference = calculatedBalance - currentBalance;

      console.log(`   💰 Current balance: ${currentBalance.toFixed(2)}`);
      console.log(`   ✅ Calculated balance: ${calculatedBalance.toFixed(2)}`);
      console.log(`   ${Math.abs(difference) > 0.01 ? '⚠️' : '✓'} Difference: ${difference.toFixed(2)}`);

      if (Math.abs(difference) > 0.01) {
        corrections.push({
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          currency: account.currency,
          currentBalance,
          calculatedBalance,
          difference,
          transactionCount: transactions.length,
        });

        // Update the account balance
        await prisma.account.update({
          where: { id: account.id },
          data: { balance: calculatedBalance },
        });

        console.log(`   ✅ Balance updated!`);
        totalAccountsUpdated++;
      } else {
        console.log(`   ✓ Balance is correct, no update needed`);
      }
    }

    // Print summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 BALANCE RECALCULATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Total accounts processed: ${accounts.length}`);
    console.log(`🔧 Accounts updated: ${totalAccountsUpdated}`);
    console.log(`✓ Accounts already correct: ${accounts.length - totalAccountsUpdated}`);

    if (corrections.length > 0) {
      console.log('\n\n🔧 CORRECTIONS APPLIED:\n');

      for (const correction of corrections) {
        console.log(`📌 ${correction.accountName} (${correction.accountType})`);
        console.log(`   Currency: ${correction.currency}`);
        console.log(`   Transactions: ${correction.transactionCount}`);
        console.log(`   Old balance: ${correction.currentBalance.toFixed(2)}`);
        console.log(`   New balance: ${correction.calculatedBalance.toFixed(2)}`);
        console.log(`   Adjustment: ${correction.difference > 0 ? '+' : ''}${correction.difference.toFixed(2)}`);
        console.log('');
      }

      // Calculate total adjustments per currency
      const adjustmentsByCurrency = corrections.reduce((acc, c) => {
        if (!acc[c.currency]) {
          acc[c.currency] = 0;
        }
        acc[c.currency] += c.difference;
        return acc;
      }, {} as Record<string, number>);

      console.log('💵 TOTAL ADJUSTMENTS BY CURRENCY:');
      Object.entries(adjustmentsByCurrency).forEach(([currency, total]) => {
        console.log(`   ${currency}: ${total > 0 ? '+' : ''}${total.toFixed(2)}`);
      });
    } else {
      console.log('\n✅ All account balances were already correct!');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Balance recalculation completed successfully!');
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('\n❌ Error during balance recalculation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
recalculateAccountBalances()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
