/**
 * Backfill Script: Portfolio Snapshots
 *
 * This script calculates and saves portfolio snapshots for all existing transactions
 * that don't have a snapshotValue yet. This enables accurate historical performance charts.
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-snapshots.ts
 */

import { PrismaClient } from '@prisma/client';
import { investmentTransactionService } from '../services/investment-transaction.service';

const prisma = new PrismaClient();

async function backfillSnapshots() {
  console.log('🔄 Starting backfill of portfolio snapshots...\n');

  try {
    // Get all transactions without snapshots, ordered by account and date
    const transactions = await prisma.investmentTransaction.findMany({
      where: { snapshotValue: null },
      orderBy: [
        { accountId: 'asc' },
        { transactionDate: 'asc' },
      ],
    });

    console.log(`📊 Found ${transactions.length} transactions to process\n`);

    if (transactions.length === 0) {
      console.log('✅ All transactions already have snapshots. Nothing to do!\n');
      return;
    }

    let processed = 0;
    let errors = 0;
    let currentAccountId = '';

    for (const tx of transactions) {
      try {
        // Log account change for progress tracking
        if (tx.accountId !== currentAccountId) {
          currentAccountId = tx.accountId;
          console.log(`\n📁 Processing account: ${currentAccountId}`);
        }

        // Calculate portfolio snapshot at transaction date
        const snapshot = await investmentTransactionService.calculatePortfolioSnapshot(
          tx.userId,
          tx.accountId,
          new Date(tx.transactionDate)
        );

        // Update transaction with calculated snapshot
        await prisma.investmentTransaction.update({
          where: { id: tx.id },
          data: { snapshotValue: snapshot.totalValue },
        });

        processed++;

        // Progress indicator every 10 transactions
        if (processed % 10 === 0) {
          console.log(`   ✅ Processed ${processed}/${transactions.length} transactions`);
        }
      } catch (error) {
        errors++;
        console.error(`   ❌ Error processing transaction ${tx.id}:`, error);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📋 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully processed: ${processed}/${transactions.length}`);
    console.log(`❌ Errors encountered: ${errors}`);
    console.log(`📊 Success rate: ${((processed / transactions.length) * 100).toFixed(2)}%`);
    console.log('='.repeat(60) + '\n');

    if (errors > 0) {
      console.log('⚠️  Some transactions failed to process. Check error logs above.\n');
    } else {
      console.log('🎉 Backfill completed successfully! Portfolio performance charts should now work correctly.\n');
    }
  } catch (error) {
    console.error('💥 Fatal error during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute backfill
backfillSnapshots()
  .then(() => {
    console.log('✅ Script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
