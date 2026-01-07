import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeDecember() {
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
    console.log('');

    // December 2025
    const month = 11; // December (0-indexed)
    const year = 2025;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    console.log('='.repeat(80));
    console.log('MES: Diciembre 2025');
    console.log('='.repeat(80));
    console.log('');

    // Find categories
    const [inversionesCategory, prestamoOtorgadoCategory, cobroPrestamoCategory] = await Promise.all([
      prisma.categoryTemplate.findFirst({
        where: { name: 'Inversiones', type: 'INCOME', parentTemplateId: null }
      }),
      prisma.categoryTemplate.findFirst({
        where: { name: 'Préstamo otorgado', type: 'EXPENSE' }
      }),
      prisma.categoryTemplate.findFirst({
        where: { name: 'Cobro de préstamo', type: 'INCOME' }
      })
    ]);

    // ============================================================
    // INCOME ANALYSIS
    // ============================================================
    console.log('💰 ANALISIS DE INGRESOS (INCOME)');
    console.log('='.repeat(80));
    console.log('');

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

    let totalIncomeAll = 0;
    let totalLoanRepayments = 0;
    let totalOperationalIncome = 0;

    console.log(`Total de transacciones INCOME: ${allIncomeTransactions.length}`);
    console.log('');

    allIncomeTransactions.forEach((tx, index) => {
      const amount = Number(tx.amount);
      const isLoanRepayment = tx.categoryId === cobroPrestamoCategory?.id || tx.loanPayment;

      totalIncomeAll += amount;
      if (isLoanRepayment) {
        totalLoanRepayments += amount;
      } else {
        totalOperationalIncome += amount;
      }

      const label = isLoanRepayment ? '🔴 COBRO DE PRESTAMO' : '✅ INGRESO OPERATIVO';

      console.log(`   ${index + 1}. ${label}`);
      console.log(`      Monto: $${amount.toLocaleString('es-CL')}`);
      console.log(`      Descripcion: ${tx.description || 'Sin descripción'}`);
      console.log(`      Fecha: ${tx.date.toISOString().split('T')[0]}`);
      if (tx.loanPayment) {
        console.log(`      ⚠️  Vinculado a LoanPayment`);
      }
      console.log('');
    });

    console.log('-'.repeat(80));
    console.log('RESUMEN INGRESOS:');
    console.log(`   Total TODOS los ingresos:      $${totalIncomeAll.toLocaleString('es-CL')}`);
    console.log(`   Cobros de préstamos:           $${totalLoanRepayments.toLocaleString('es-CL')} 🔴`);
    console.log(`   Ingresos operativos:           $${totalOperationalIncome.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('IMPACTO DEL CAMBIO:');
    console.log(`   ANTES (con préstamos):         $${totalIncomeAll.toLocaleString('es-CL')}`);
    console.log(`   DESPUES (sin préstamos):       $${totalOperationalIncome.toLocaleString('es-CL')}`);
    console.log(`   REDUCCION:                     $${totalLoanRepayments.toLocaleString('es-CL')}`);
    console.log('');
    console.log('');

    // ============================================================
    // EXPENSE ANALYSIS
    // ============================================================
    console.log('💸 ANALISIS DE GASTOS (EXPENSE)');
    console.log('='.repeat(80));
    console.log('');

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

    let totalExpenseAll = 0;
    let totalShared = 0;
    let totalLoans = 0;
    let totalInversiones = 0;
    let totalPersonal = 0;

    const loanDetails: any[] = [];
    const sharedDetails: any[] = [];
    const personalDetails: any[] = [];

    console.log(`Total de transacciones EXPENSE: ${allExpenseTransactions.length}`);
    console.log('');

    allExpenseTransactions.forEach((tx, index) => {
      const amount = Number(tx.amount);
      const isShared = tx.sharedExpenseId !== null;
      const isLoan = tx.loanId !== null;
      const isInversion = tx.categoryId === inversionesCategory?.id;

      totalExpenseAll += amount;

      let type = '';
      if (isShared) {
        totalShared += amount;
        type = '🔵 GASTO COMPARTIDO';
        sharedDetails.push(tx);
      } else if (isLoan) {
        totalLoans += amount;
        type = '🔴 PRESTAMO OTORGADO';
        loanDetails.push(tx);
      } else if (isInversion) {
        totalInversiones += amount;
        type = '🟡 INVERSION';
      } else {
        totalPersonal += amount;
        type = '✅ GASTO PERSONAL';
        personalDetails.push(tx);
      }

      console.log(`   ${index + 1}. ${type}`);
      console.log(`      Monto: $${amount.toLocaleString('es-CL')}`);
      console.log(`      Descripcion: ${tx.description || 'Sin descripción'}`);
      console.log(`      Fecha: ${tx.date.toISOString().split('T')[0]}`);

      if (tx.sharedExpenseId) {
        console.log(`      SharedExpense: ${tx.sharedExpense?.description || tx.sharedExpenseId}`);
      }
      if (tx.loanId) {
        console.log(`      Loan a: ${tx.loan?.borrowerName || tx.loanId}`);
      }
      console.log('');
    });

    console.log('-'.repeat(80));
    console.log('RESUMEN GASTOS:');
    console.log(`   Total TODOS los gastos:        $${totalExpenseAll.toLocaleString('es-CL')}`);
    console.log(`   Gastos compartidos:            $${totalShared.toLocaleString('es-CL')} 🔵 (excluidos)`);
    console.log(`   Prestamos otorgados:           $${totalLoans.toLocaleString('es-CL')} 🔴 (excluidos)`);
    console.log(`   Inversiones:                   $${totalInversiones.toLocaleString('es-CL')} 🟡 (excluidos)`);
    console.log(`   Gastos personales:             $${totalPersonal.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('IMPACTO DEL CAMBIO:');
    console.log(`   ANTES (solo excluia compartidos): $${(totalExpenseAll - totalShared).toLocaleString('es-CL')}`);
    console.log(`   DESPUES (excluye compartidos + préstamos): $${totalPersonal.toLocaleString('es-CL')}`);
    console.log(`   REDUCCION por excluir préstamos: $${totalLoans.toLocaleString('es-CL')}`);
    console.log('');
    console.log('');

    // ============================================================
    // SHARED EXPENSES ANALYSIS
    // ============================================================
    console.log('🤝 ANALISIS DE GASTOS COMPARTIDOS (Tu parte)');
    console.log('='.repeat(80));
    console.log('');

    const sharedExpensesParticipant = await prisma.expenseParticipant.findMany({
      where: {
        userId: user.id,
        expense: {
          date: { gte: firstDay, lte: lastDay }
        }
      },
      include: {
        expense: {
          select: {
            description: true,
            amount: true,
            date: true
          }
        }
      }
    });

    let totalSharedOwed = 0;

    sharedExpensesParticipant.forEach((participant, index) => {
      const amountOwed = Number(participant.amountOwed);
      totalSharedOwed += amountOwed;

      console.log(`   ${index + 1}. ${participant.expense.description}`);
      console.log(`      Total del gasto: $${Number(participant.expense.amount).toLocaleString('es-CL')}`);
      console.log(`      Tu parte: $${amountOwed.toLocaleString('es-CL')}`);
      console.log(`      Pagado: ${participant.isPaid ? 'Si' : 'No'}`);
      console.log(`      Fecha: ${participant.expense.date.toISOString().split('T')[0]}`);
      console.log('');
    });

    console.log('-'.repeat(80));
    console.log(`Total de tu parte en gastos compartidos: $${totalSharedOwed.toLocaleString('es-CL')}`);
    console.log(`Numero de participaciones: ${sharedExpensesParticipant.length}`);
    console.log('');
    console.log('');

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    console.log('='.repeat(80));
    console.log('📊 RESUMEN FINAL - WIDGETS EN DICIEMBRE 2025');
    console.log('='.repeat(80));
    console.log('');
    console.log('WIDGET: Monthly Income');
    console.log(`   ANTES: $${totalIncomeAll.toLocaleString('es-CL')} (incluye ${totalLoanRepayments.toLocaleString('es-CL')} de préstamos)`);
    console.log(`   DESPUES: $${totalOperationalIncome.toLocaleString('es-CL')} ✅`);
    console.log(`   Diferencia: -$${totalLoanRepayments.toLocaleString('es-CL')}`);
    console.log('');
    console.log('WIDGET: Personal Expenses');
    console.log(`   ANTES: $${(totalExpenseAll - totalShared).toLocaleString('es-CL')} (incluye ${totalLoans.toLocaleString('es-CL')} de préstamos)`);
    console.log(`   DESPUES: $${totalPersonal.toLocaleString('es-CL')} ✅`);
    console.log(`   Diferencia: -$${totalLoans.toLocaleString('es-CL')}`);
    console.log('');
    console.log('WIDGET: Shared Expenses');
    console.log(`   Monto: $${totalSharedOwed.toLocaleString('es-CL')} (tu parte) ✅`);
    console.log('');

    if (totalLoanRepayments > 0 || totalLoans > 0) {
      console.log('⚠️  ATENCION:');
      console.log(`   En diciembre SI hay prestamos que afectan los widgets:`);
      if (totalLoanRepayments > 0) {
        console.log(`   - Cobros de préstamos: $${totalLoanRepayments.toLocaleString('es-CL')}`);
      }
      if (totalLoans > 0) {
        console.log(`   - Préstamos otorgados: $${totalLoans.toLocaleString('es-CL')}`);
      }
      console.log('');
      console.log(`   Los cambios implementados SI tendran impacto en diciembre.`);
    } else {
      console.log('ℹ️  En diciembre NO hay prestamos, por lo que los cambios no afectan este mes.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDecember();
