import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBBAI() {
  console.log('🔍 Checking BBAI transactions and holdings...\n');

  // Get user (assuming first user for now)
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found');
    return;
  }

  console.log(`User: ${user.email}\n`);

  // Get BBAI holdings
  const holdings = await prisma.investmentHolding.findMany({
    where: {
      userId: user.id,
      assetSymbol: 'BBAI',
    },
    include: {
      account: true,
    },
  });

  console.log('📊 BBAI Holdings:');
  holdings.forEach(holding => {
    console.log(`  Account: ${holding.account.name}`);
    console.log(`  Symbol: ${holding.assetSymbol}`);
    console.log(`  Quantity: ${holding.totalQuantity}`);
    console.log(`  Cost Basis: $${holding.totalCostBasis}`);
    console.log(`  Realized P&L: $${holding.realizedGainLoss}`);
    console.log(`  Created: ${holding.createdAt}`);
    console.log(`  Updated: ${holding.updatedAt}\n`);
  });

  // Get BBAI transactions
  const transactions = await prisma.investmentTransaction.findMany({
    where: {
      userId: user.id,
      assetSymbol: 'BBAI',
    },
    orderBy: {
      transactionDate: 'asc',
    },
  });

  console.log('\n📜 BBAI Transactions (chronological):');
  let runningTotal = 0;
  transactions.forEach((tx, index) => {
    const qty = Number(tx.quantity);
    runningTotal += qty;
    const type = tx.transactionType;
    const price = Number(tx.pricePerUnit);
    const date = new Date(tx.transactionDate).toISOString().split('T')[0];

    console.log(`${index + 1}. ${date} | ${type.padEnd(6)} | ${qty.toString().padStart(6)} @ $${price.toFixed(2).padStart(6)} | Running Total: ${runningTotal.toString().padStart(6)}`);
  });

  console.log(`\n✅ Final Position: ${runningTotal} shares`);
  console.log(`📊 Holdings show: ${holdings[0]?.totalQuantity || 0} shares`);

  if (runningTotal !== Number(holdings[0]?.totalQuantity || 0)) {
    console.log('\n⚠️  MISMATCH DETECTED! Holdings do not match transaction history.');
  }

  await prisma.$disconnect();
}

checkBBAI().catch(console.error);
