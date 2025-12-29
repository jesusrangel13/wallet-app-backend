import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditDividends(accountId: string) {
  console.log('\n=== AUDITORÍA DE DIVIDENDOS ===\n');

  const dividends = await prisma.investmentTransaction.findMany({
    where: {
      accountId,
      type: 'DIVIDEND'
    },
    select: {
      id: true,
      assetSymbol: true,
      totalAmount: true,
      fees: true,
      transactionDate: true
    },
    orderBy: { transactionDate: 'desc' }
  });

  console.log(`Total DIVIDENDs en BD: ${dividends.length}\n`);

  let posCount = 0, negCount = 0;
  let posSum = 0, negSum = 0;
  let totalFees = 0;
  let divsWithFees = 0;

  console.log('Fecha      | Símbolo | Monto      | Fees   | Impacto');
  console.log('='.repeat(65));

  dividends.forEach(div => {
    const amount = Number(div.totalAmount);
    const fees = Number(div.fees);
    const date = div.transactionDate.toISOString().split('T')[0];
    const impact = amount - fees;

    console.log(
      `${date} | ${div.assetSymbol.padEnd(7)} | ` +
      `${(amount >= 0 ? '+' : '')}$${amount.toFixed(2).padStart(8)} | ` +
      `$${fees.toFixed(2).padStart(6)} | ` +
      `${(impact >= 0 ? '+' : '')}$${impact.toFixed(2)}`
    );

    if (amount >= 0) {
      posCount++;
      posSum += amount;
    } else {
      negCount++;
      negSum += amount;
    }

    totalFees += fees;
    if (fees > 0) divsWithFees++;
  });

  console.log('\n=== RESUMEN ===');
  console.log(`Dividendos Positivos: ${posCount} txns, Total: $${posSum.toFixed(2)}`);
  console.log(`Dividendos Negativos: ${negCount} txns, Total: $${negSum.toFixed(2)}`);
  console.log(`Fees Totales: $${totalFees.toFixed(2)} ${totalFees > 0 ? '🔴 ERROR' : '✅'}`);
  console.log(`DIVIDENDs con fees: ${divsWithFees} ${divsWithFees > 0 ? '🔴 PROBLEMA DETECTADO' : '✅'}`);
  console.log(`Impacto neto en balance: $${(posSum + negSum - totalFees).toFixed(2)}\n`);

  await prisma.$disconnect();
}

const accountId = process.argv[2];
if (!accountId) {
  console.error('Usage: npx ts-node scripts/audit-dividends.ts <accountId>');
  process.exit(1);
}

auditDividends(accountId);
