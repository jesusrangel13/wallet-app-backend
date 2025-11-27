import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPaidExpenses() {
  const juanUser = await prisma.user.findUnique({
    where: { email: 'juanperez@gmail.com' }
  });

  if (!juanUser) {
    console.log('Usuario Juan no encontrado');
    await prisma.$disconnect();
    return;
  }

  const participants = await prisma.expenseParticipant.findMany({
    where: {
      userId: juanUser.id,
      isPaid: true
    },
    include: {
      expense: {
        select: {
          id: true,
          description: true,
          amount: true,
          paidByUserId: true,
        }
      },
      user: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      paidDate: 'desc'
    },
    take: 5
  });

  console.log('\n=== GASTOS MARCADOS COMO PAGADOS POR JUAN ===\n');
  if (participants.length === 0) {
    console.log('No hay gastos marcados como pagados\n');
  } else {
    for (const p of participants) {
      console.log(`Gasto: ${p.expense.description}`);
      console.log(`  Monto adeudado: $${p.amountOwed}`);
      console.log(`  Pagado: ${p.isPaid ? 'SÍ' : 'NO'}`);
      console.log(`  Fecha de pago: ${p.paidDate?.toISOString() || 'N/A'}`);
      console.log(`  Monto pagado: $${p.paidAmount || 0}`);
      console.log('');
    }
  }

  await prisma.$disconnect();
}

checkPaidExpenses();
