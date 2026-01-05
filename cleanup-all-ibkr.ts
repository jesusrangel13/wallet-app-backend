#!/usr/bin/env ts-node
/**
 * Complete cleanup script for IBKR account
 * Deletes ALL data for the account regardless of import history
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNT_ID = 'caa574b2-392a-4df7-8d4e-68d59a77e8a1';

async function main() {
  console.log('🧹 Starting complete cleanup of IBKR account...\n');

  // Step 1: Delete all investment transactions
  console.log('🗑️  Step 1: Deleting all investment transactions...');
  const deletedInvestmentTxns = await prisma.investmentTransaction.deleteMany({
    where: { accountId: ACCOUNT_ID },
  });
  console.log(`✅ Deleted ${deletedInvestmentTxns.count} investment transactions\n`);

  // Step 2: Delete all regular transactions
  console.log('🗑️  Step 2: Deleting all regular transactions...');
  const deletedRegularTxns = await prisma.transaction.deleteMany({
    where: { accountId: ACCOUNT_ID },
  });
  console.log(`✅ Deleted ${deletedRegularTxns.count} regular transactions\n`);

  // Step 3: Delete all holdings
  console.log('🗑️  Step 3: Deleting all holdings...');
  const deletedHoldings = await prisma.investmentHolding.deleteMany({
    where: { accountId: ACCOUNT_ID },
  });
  console.log(`✅ Deleted ${deletedHoldings.count} holdings\n`);

  // Step 4: Delete all import records for this account
  console.log('🗑️  Step 4: Deleting all import records...');
  const importHistories = await prisma.investmentImportHistory.findMany({
    where: { accountId: ACCOUNT_ID },
    select: { id: true },
  });

  for (const history of importHistories) {
    // Delete imported transaction records
    await prisma.investmentImportedTransaction.deleteMany({
      where: { importHistoryId: history.id },
    });

    // Delete import history
    await prisma.investmentImportHistory.delete({
      where: { id: history.id },
    });
  }
  console.log(`✅ Deleted ${importHistories.length} import histories\n`);

  // Step 5: Reset account balance
  console.log('💰 Step 5: Resetting account balance to 0...');
  await prisma.account.update({
    where: { id: ACCOUNT_ID },
    data: { balance: 0 },
  });
  console.log('✅ Account balance reset to $0.00\n');

  console.log('='.repeat(80));
  console.log('✅ COMPLETE CLEANUP FINISHED!');
  console.log('='.repeat(80));
  console.log('\n📝 Summary:');
  console.log(`   - Investment transactions deleted: ${deletedInvestmentTxns.count}`);
  console.log(`   - Regular transactions deleted: ${deletedRegularTxns.count}`);
  console.log(`   - Holdings deleted: ${deletedHoldings.count}`);
  console.log(`   - Import histories deleted: ${importHistories.length}`);
  console.log(`   - Account balance: $0.00`);
  console.log('\n✅ Account is completely clean and ready for fresh import!');
}

main()
  .catch((error) => {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
