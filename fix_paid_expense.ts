import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPaidExpense() {
  // Buscar el gasto que Juan marcó como pagado
  const juanUser = await prisma.user.findUnique({
    where: { email: 'juanperez@gmail.com' }
  });

  if (!juanUser) {
    console.log('❌ Usuario Juan no encontrado');
    await prisma.$disconnect();
    return;
  }

  // Buscar participantes marcados como pagados
  const paidParticipants = await prisma.expenseParticipant.findMany({
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
        }
      }
    }
  });

  console.log('\n=== GASTOS MARCADOS COMO PAGADOS POR JUAN ===\n');

  if (paidParticipants.length === 0) {
    console.log('No hay gastos marcados como pagados para revertir\n');
    await prisma.$disconnect();
    return;
  }

  for (const participant of paidParticipants) {
    console.log(`Gasto: ${participant.expense.description}`);
    console.log(`  Monto: $${participant.amountOwed}`);
    console.log(`  Fecha de pago: ${participant.paidDate?.toISOString() || 'N/A'}`);
    console.log(`  Revirtiendo estado de pago...\n`);

    // Revertir el estado de pago
    await prisma.expenseParticipant.update({
      where: { id: participant.id },
      data: {
        isPaid: false,
        paidDate: null,
        paidAmount: null,
      }
    });

    console.log(`✅ Gasto "${participant.expense.description}" desmarcado como pagado\n`);
  }

  console.log(`\n✅ Total de gastos revertidos: ${paidParticipants.length}`);
  console.log('\nAhora Pedro debe configurar su cuenta por defecto en Settings.');
  console.log('Después Juan puede volver a marcar el gasto como pagado.\n');

  await prisma.$disconnect();
}

fixPaidExpense();
