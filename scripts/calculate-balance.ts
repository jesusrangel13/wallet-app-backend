import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function calculateBalance(accountId: string) {
  console.log('\n=== CÁLCULO MANUAL DE BALANCE ===\n');

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { name: true, balance: true }
  });

  console.log(`Cuenta: ${account?.name}`);
  console.log(`Balance actual en BD: $${Number(account?.balance).toFixed(2)}\n`);

  const [investmentTxns, regularTxns] = await Promise.all([
    prisma.investmentTransaction.findMany({
      where: { accountId },
      select: { type: true, totalAmount: true, fees: true },
      orderBy: { transactionDate: 'asc' },
    }),
    prisma.transaction.findMany({
      where: {
        accountId,
        type: { in: ['INCOME', 'EXPENSE'] },
      },
      select: { type: true, amount: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  let balance = 0;
  const breakdown: Record<string, { count: number; impact: number; fees: number }> = {};

  // Investment transactions
  for (const txn of investmentTxns) {
    const totalAmount = Number(txn.totalAmount);
    const fees = Number(txn.fees);
    let impact = 0;

    if (!breakdown[txn.type]) {
      breakdown[txn.type] = { count: 0, impact: 0, fees: 0 };
    }

    if (txn.type === 'BUY') {
      impact = -(totalAmount + fees);
    } else if (txn.type === 'SELL') {
      impact = totalAmount - fees;
    } else if (txn.type === 'DIVIDEND' || txn.type === 'INTEREST') {
      impact = totalAmount - fees;
    }

    breakdown[txn.type].count++;
    breakdown[txn.type].impact += impact;
    breakdown[txn.type].fees += fees;
    balance += impact;
  }

  // Regular transactions
  for (const txn of regularTxns) {
    const amount = Number(txn.amount);
    let impact = 0;

    if (!breakdown[txn.type]) {
      breakdown[txn.type] = { count: 0, impact: 0, fees: 0 };
    }

    if (txn.type === 'INCOME') {
      impact = amount;
    } else if (txn.type === 'EXPENSE') {
      impact = -amount;
    }

    breakdown[txn.type].count++;
    breakdown[txn.type].impact += impact;
    balance += impact;
  }

  console.log('=== DESGLOSE POR TIPO ===');
  Object.entries(breakdown).forEach(([type, data]) => {
    console.log(
      `${type.padEnd(10)} | ` +
      `${String(data.count).padStart(4)} txns | ` +
      `Impact: $${data.impact.toFixed(2).padStart(10)} | ` +
      `Fees: $${data.fees.toFixed(2).padStart(8)}`
    );
  });

  console.log(`\n=== RESULTADO ===`);
  console.log(`Balance calculado: $${balance.toFixed(2)}`);
  console.log(`Balance en BD:     $${Number(account?.balance).toFixed(2)}`);
  console.log(`Discrepancia:      $${(Number(account?.balance) - balance).toFixed(2)}`);
  console.log(`Objetivo (Hapi):   $919.78`);
  console.log(`Diferencia:        $${(balance - 919.78).toFixed(2)}\n`);

  await prisma.$disconnect();
}

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: npx ts-node scripts/calculate-balance.ts <accountId>');
  process.exit(1);
}

calculateBalance(accountId);
