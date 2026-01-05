#!/usr/bin/env ts-node
/**
 * Cleanup script to delete corrupted IBKR import and reset account
 *
 * This script will:
 * 1. Find the import history for U3977847-converted-hapi-format-full.csv
 * 2. Delete all investment transactions created by that import
 * 3. Delete all regular transactions (DEPOSIT) created by that import
 * 4. Delete all import records
 * 5. Delete the import history
 * 6. Reset the account balance to 0
 * 7. Delete all holdings for the account
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_ID = 'caa574b2-392a-4df7-8d4e-68d59a77e8a1';
const CSV_FILENAME = 'U3977847-converted-hapi-format-full.csv';

async function main() {
  console.log('🧹 Starting cleanup of corrupted IBKR import...\n');

  // Step 1: Find the import history
  console.log(`📋 Step 1: Finding import history for "${CSV_FILENAME}"...`);
  const importHistory = await prisma.investmentImportHistory.findFirst({
    where: {
      fileName: CSV_FILENAME,
    },
    orderBy: {
      importedAt: 'desc',
    },
    include: {
      importedTransactions: true,
    },
  });

  if (!importHistory) {
    console.log('❌ No import history found for this file.');
    return;
  }

  console.log(`✅ Found import history: ${importHistory.id}`);
  console.log(`   - Import Date: ${importHistory.importedAt.toISOString()}`);
  console.log(`   - Status: ${importHistory.status}`);
  console.log(`   - Success Count: ${importHistory.successCount}`);
  console.log(`   - Failed Count: ${importHistory.failedCount}`);
  console.log(`   - Total Imported Transactions: ${importHistory.importedTransactions.length}`);
  console.log('');

  // Step 2: Get transaction IDs
  console.log('📋 Step 2: Collecting transaction IDs...');
  const investmentTransactionIds = importHistory.importedTransactions
    .map(t => t.investmentTransactionId)
    .filter(id => id !== null) as string[];

  const regularTransactionIds = importHistory.importedTransactions
    .map(t => t.regularTransactionId)
    .filter(id => id !== null) as string[];

  console.log(`   - Investment transactions to delete: ${investmentTransactionIds.length}`);
  console.log(`   - Regular transactions to delete: ${regularTransactionIds.length}`);
  console.log('');

  // Step 3: Delete investment transactions
  if (investmentTransactionIds.length > 0) {
    console.log('🗑️  Step 3: Deleting investment transactions...');
    const deletedInvestmentTxns = await prisma.investmentTransaction.deleteMany({
      where: {
        id: { in: investmentTransactionIds },
      },
    });
    console.log(`✅ Deleted ${deletedInvestmentTxns.count} investment transactions`);
    console.log('');
  }

  // Step 4: Delete regular transactions
  if (regularTransactionIds.length > 0) {
    console.log('🗑️  Step 4: Deleting regular transactions...');
    const deletedRegularTxns = await prisma.transaction.deleteMany({
      where: {
        id: { in: regularTransactionIds },
      },
    });
    console.log(`✅ Deleted ${deletedRegularTxns.count} regular transactions`);
    console.log('');
  }

  // Step 5: Delete import records
  console.log('🗑️  Step 5: Deleting import records...');
  const deletedImportRecords = await prisma.investmentImportedTransaction.deleteMany({
    where: {
      importHistoryId: importHistory.id,
    },
  });
  console.log(`✅ Deleted ${deletedImportRecords.count} import records`);
  console.log('');

  // Step 6: Delete import history
  console.log('🗑️  Step 6: Deleting import history...');
  await prisma.investmentImportHistory.delete({
    where: {
      id: importHistory.id,
    },
  });
  console.log('✅ Deleted import history');
  console.log('');

  // Step 7: Reset account balance
  console.log('💰 Step 7: Resetting account balance to 0...');
  await prisma.account.update({
    where: {
      id: ACCOUNT_ID,
    },
    data: {
      balance: 0,
    },
  });
  console.log('✅ Account balance reset to $0.00');
  console.log('');

  // Step 8: Delete all holdings
  console.log('📊 Step 8: Deleting all holdings...');
  const deletedHoldings = await prisma.investmentHolding.deleteMany({
    where: {
      accountId: ACCOUNT_ID,
    },
  });
  console.log(`✅ Deleted ${deletedHoldings.count} holdings`);
  console.log('');

  console.log('='.repeat(80));
  console.log('✅ CLEANUP COMPLETED SUCCESSFULLY!');
  console.log('='.repeat(80));
  console.log('');
  console.log('📝 Summary:');
  console.log(`   - Investment transactions deleted: ${investmentTransactionIds.length}`);
  console.log(`   - Regular transactions deleted: ${regularTransactionIds.length}`);
  console.log(`   - Import records deleted: ${deletedImportRecords.count}`);
  console.log(`   - Holdings deleted: ${deletedHoldings.count}`);
  console.log(`   - Account balance reset: $0.00`);
  console.log('');
  console.log('✅ You can now re-import the CSV file with the fixed FEE handler!');
}

main()
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
