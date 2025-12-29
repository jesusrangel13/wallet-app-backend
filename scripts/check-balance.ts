import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkBalance() {
  console.log('🔍 Checking Investment Account Balance...\n');

  // Get investment account
  const account = await prisma.account.findFirst({
    where: { type: 'INVESTMENT' },
  });

  if (!account) {
    console.log('No investment account found');
    return;
  }

  console.log(`Account: ${account.name}`);
  console.log(`Current Balance in DB: $${Number(account.balance).toFixed(2)}\n`);

  // Get recent investment transactions
  const investmentTxns = await prisma.investmentTransaction.findMany({
    where: { accountId: account.id },
    select: {
      transactionDate: true,
      assetSymbol: true,
      type: true,
      quantity: true,
      pricePerUnit: true,
      totalAmount: true,
      fees: true,
    },
    orderBy: { transactionDate: 'desc' },
    take: 10,
  });

  console.log('📊 Recent Investment Transactions:');
  console.log('Date       | Symbol | Type     | Qty     | Price   | Total    | Fees  | Net Impact');
  console.log('='.repeat(95));

  investmentTxns.forEach((tx) => {
    const date = new Date(tx.transactionDate).toISOString().split('T')[0];
    const qty = Number(tx.quantity);
    const price = Number(tx.pricePerUnit);
    const total = Number(tx.totalAmount);
    const fees = Number(tx.fees);

    let netImpact = 0;
    if (tx.type === 'BUY') {
      netImpact = -(total + fees);
    } else if (tx.type === 'SELL') {
      netImpact = total - fees;
    } else if (tx.type === 'DIVIDEND' || tx.type === 'INTEREST') {
      netImpact = total - fees;
    }

    console.log(
      `${date} | ${tx.assetSymbol.padEnd(6)} | ${tx.type.padEnd(8)} | ${qty.toFixed(2).padStart(7)} | ${price.toFixed(2).padStart(7)} | ${total.toFixed(2).padStart(8)} | ${fees.toFixed(2).padStart(5)} | ${netImpact.toFixed(2).padStart(10)}`
    );
  });

  // Get regular transactions (deposits/withdrawals)
  const regularTxns = await prisma.transaction.findMany({
    where: {
      accountId: account.id,
      type: { in: ['INCOME', 'EXPENSE'] },
    },
    select: {
      date: true,
      type: true,
      amount: true,
      description: true,
    },
    orderBy: { date: 'desc' },
    take: 10,
  });

  if (regularTxns.length > 0) {
    console.log('\n📝 Regular Transactions (Deposits/Withdrawals):');
    console.log('Date       | Type    | Amount   | Description');
    console.log('='.repeat(70));

    regularTxns.forEach((tx) => {
      const date = new Date(tx.date).toISOString().split('T')[0];
      const amount = Number(tx.amount);
      const impact = tx.type === 'INCOME' ? amount : -amount;

      console.log(
        `${date} | ${tx.type.padEnd(7)} | ${impact.toFixed(2).padStart(8)} | ${tx.description || ''}`
      );
    });
  }

  // Recalculate balance manually
  console.log('\n🧮 Manual Balance Calculation:');

  const allInvestmentTxns = await prisma.investmentTransaction.findMany({
    where: { accountId: account.id },
    select: { type: true, totalAmount: true, fees: true },
    orderBy: { transactionDate: 'asc' },
  });

  const allRegularTxns = await prisma.transaction.findMany({
    where: {
      accountId: account.id,
      type: { in: ['INCOME', 'EXPENSE'] },
    },
    select: { type: true, amount: true },
    orderBy: { date: 'asc' },
  });

  let calculatedBalance = 0;

  for (const txn of allInvestmentTxns) {
    const totalAmount = Number(txn.totalAmount);
    const fees = Number(txn.fees);

    if (txn.type === 'BUY') {
      calculatedBalance -= totalAmount + fees;
    } else if (txn.type === 'SELL') {
      calculatedBalance += totalAmount - fees;
    } else if (txn.type === 'DIVIDEND' || txn.type === 'INTEREST') {
      calculatedBalance += totalAmount - fees;
    }
  }

  for (const txn of allRegularTxns) {
    const amount = Number(txn.amount);
    if (txn.type === 'INCOME') {
      calculatedBalance += amount;
    } else if (txn.type === 'EXPENSE') {
      calculatedBalance -= amount;
    }
  }

  console.log(`Investment transactions: ${allInvestmentTxns.length}`);
  console.log(`Regular transactions: ${allRegularTxns.length}`);
  console.log(`Calculated Balance: $${calculatedBalance.toFixed(2)}`);
  console.log(`DB Balance: $${Number(account.balance).toFixed(2)}`);
  console.log(`Difference: $${(calculatedBalance - Number(account.balance)).toFixed(2)}`);

  await prisma.$disconnect();
}

checkBalance().catch(console.error);
