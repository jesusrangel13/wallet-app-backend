import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkExpenseTransactions() {
  try {
    // Find Jesus Leon Rangel user
    const user = await prisma.user.findFirst({
      where: { name: { contains: 'Jesus Leon Rangel' } },
      select: { id: true, name: true, email: true }
    });

    if (!user) {
      console.log('Usuario no encontrado');
      return;
    }

    console.log('Usuario encontrado:');
    console.log('   Nombre:', user.name);
    console.log('   Email:', user.email);
    console.log('   ID:', user.id);
    console.log('');

    // Get current month
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    console.log('Mes actual:', now.toLocaleString('es', { month: 'long', year: 'numeric' }));
    console.log('');

    // Find categories to exclude
    const [inversionesCategory, prestamoOtorgadoCategory] = await Promise.all([
      prisma.categoryTemplate.findFirst({
        where: { name: 'Inversiones', type: 'INCOME', parentTemplateId: null }
      }),
      prisma.categoryTemplate.findFirst({
        where: { name: 'Préstamo otorgado', type: 'EXPENSE' }
      })
    ]);

    console.log('Categoria Inversiones:', inversionesCategory?.id || 'No encontrada');
    console.log('Categoria Prestamo otorgado:', prestamoOtorgadoCategory?.id || 'No encontrada');
    console.log('');

    // Get ALL expense transactions (before ANY filtering)
    const allExpenseTransactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: 'EXPENSE',
        date: { gte: firstDay, lte: lastDay }
      },
      include: {
        sharedExpense: {
          select: { id: true, description: true }
        },
        loan: {
          select: { id: true, borrowerName: true }
        }
      },
      orderBy: { date: 'desc' }
    });

    console.log('TODAS las transacciones de EXPENSE (sin filtros):');
    console.log('   Total:', allExpenseTransactions.length);
    console.log('');

    let totalAll = 0;
    let totalShared = 0;
    let totalLoans = 0;
    let totalInversiones = 0;
    let totalPersonal = 0;

    allExpenseTransactions.forEach((tx, index) => {
      const amount = Number(tx.amount);
      const isShared = tx.sharedExpenseId !== null;
      const isLoan = tx.loanId !== null;
      const isInversion = tx.categoryId === inversionesCategory?.id;

      totalAll += amount;

      let type = '';
      if (isShared) {
        totalShared += amount;
        type = 'COMPARTIDO';
      } else if (isLoan) {
        totalLoans += amount;
        type = 'PRESTAMO';
      } else if (isInversion) {
        totalInversiones += amount;
        type = 'INVERSION';
      } else {
        totalPersonal += amount;
        type = 'PERSONAL';
      }

      console.log(`   ${index + 1}. ${type}`);
      console.log(`      Monto: $${amount.toLocaleString('es-CL')}`);
      console.log(`      Descripcion: ${tx.description || 'Sin descripción'}`);
      console.log(`      Fecha: ${tx.date.toISOString().split('T')[0]}`);
      console.log(`      Categoria ID: ${tx.categoryId || 'Sin categoría'}`);

      if (tx.sharedExpenseId) {
        console.log(`      SharedExpense: ${tx.sharedExpense?.description || tx.sharedExpenseId}`);
      }
      if (tx.loanId) {
        console.log(`      Loan: ${tx.loan?.borrowerName || tx.loanId}`);
      }
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('RESUMEN:');
    console.log('='.repeat(80));
    console.log(`Total de TODOS los gastos:         $${totalAll.toLocaleString('es-CL')}`);
    console.log(`Total de gastos compartidos:       $${totalShared.toLocaleString('es-CL')} (excluidos)`);
    console.log(`Total de prestamos otorgados:      $${totalLoans.toLocaleString('es-CL')} (excluidos)`);
    console.log(`Total de inversiones:              $${totalInversiones.toLocaleString('es-CL')} (excluidos)`);
    console.log(`Total de gastos personales:        $${totalPersonal.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('DIFERENCIA:');
    console.log(`   Con los cambios implementados, el widget mostrará:`);
    console.log(`   ANTES: $${(totalAll - totalShared).toLocaleString('es-CL')} (incluia préstamos)`);
    console.log(`   DESPUES: $${totalPersonal.toLocaleString('es-CL')} (sin préstamos)`);
    console.log(`   Reduccion: $${totalLoans.toLocaleString('es-CL')}`);

    // Also check shared expenses
    console.log('');
    console.log('='.repeat(80));
    console.log('GASTOS COMPARTIDOS (ExpenseParticipant):');
    console.log('='.repeat(80));

    const sharedExpensesParticipant = await prisma.expenseParticipant.aggregate({
      where: {
        userId: user.id,
        expense: {
          date: { gte: firstDay, lte: lastDay }
        }
      },
      _sum: { amountOwed: true },
      _count: { id: true }
    });

    const sharedTotal = Number(sharedExpensesParticipant._sum.amountOwed || 0);
    console.log(`Total de tu parte en gastos compartidos: $${sharedTotal.toLocaleString('es-CL')}`);
    console.log(`Numero de participaciones: ${sharedExpensesParticipant._count.id}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkExpenseTransactions();
