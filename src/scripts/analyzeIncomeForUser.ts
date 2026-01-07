import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkIncomeTransactions() {
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

    // Find loan repayment category
    const cobroPrestamoCategory = await prisma.categoryTemplate.findFirst({
      where: { name: 'Cobro de préstamo', type: 'INCOME' }
    });

    console.log('Categoria Cobro de prestamo:', cobroPrestamoCategory?.id || 'No encontrada');
    console.log('');

    // Get ALL income transactions (before filtering)
    const allIncomeTransactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: 'INCOME',
        date: { gte: firstDay, lte: lastDay }
      },
      include: {
        loanPayment: true
      },
      orderBy: { date: 'desc' }
    });

    console.log('TODAS las transacciones de INCOME (sin filtros):');
    console.log('   Total:', allIncomeTransactions.length);
    console.log('');

    let totalAll = 0;
    let totalLoanRepayments = 0;
    let totalOperationalIncome = 0;

    allIncomeTransactions.forEach((tx, index) => {
      const amount = Number(tx.amount);
      const isLoanRepayment = tx.categoryId === cobroPrestamoCategory?.id || tx.loanPayment;

      totalAll += amount;
      if (isLoanRepayment) {
        totalLoanRepayments += amount;
      } else {
        totalOperationalIncome += amount;
      }

      const label = isLoanRepayment ? 'PRESTAMO' : 'OPERATIVO';

      console.log(`   ${index + 1}. ${label}`);
      console.log(`      Monto: $${amount.toLocaleString('es-CL')}`);
      console.log(`      Descripcion: ${tx.description || 'Sin descripción'}`);
      console.log(`      Fecha: ${tx.date.toISOString().split('T')[0]}`);
      console.log(`      Categoria ID: ${tx.categoryId || 'Sin categoría'}`);
      if (tx.loanPayment) {
        console.log(`      Tiene LoanPayment vinculado`);
      }
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('RESUMEN:');
    console.log('='.repeat(80));
    console.log(`Total de TODOS los ingresos:       $${totalAll.toLocaleString('es-CL')}`);
    console.log(`Total de cobros de préstamos:      $${totalLoanRepayments.toLocaleString('es-CL')}`);
    console.log(`Total de ingresos operativos:      $${totalOperationalIncome.toLocaleString('es-CL')}`);
    console.log('');
    console.log('DIFERENCIA:');
    console.log(`   Con los cambios implementados, el widget mostrará:`);
    console.log(`   ANTES: $${totalAll.toLocaleString('es-CL')} (incluye préstamos)`);
    console.log(`   DESPUES: $${totalOperationalIncome.toLocaleString('es-CL')} (sin préstamos)`);
    console.log(`   Reduccion: $${totalLoanRepayments.toLocaleString('es-CL')}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkIncomeTransactions();
