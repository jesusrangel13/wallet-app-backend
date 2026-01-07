import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeSavings() {
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
    console.log('CÁLCULO DE SAVINGS - DICIEMBRE 2025');
    console.log('='.repeat(80));
    console.log('');

    // ============================================================
    // PASO 1: CALCULAR INGRESOS (INCOME)
    // ============================================================
    console.log('📊 PASO 1: CALCULAR INGRESOS (INCOME)');
    console.log('-'.repeat(80));

    // Find categories to exclude
    const [cobroPrestamoCategory, cobroDeudaCategory] = await Promise.all([
      prisma.categoryTemplate.findFirst({
        where: { name: 'Cobro de préstamo', type: 'INCOME' }
      }),
      prisma.categoryTemplate.findFirst({
        where: { name: 'Cobro de deuda', type: 'INCOME' }
      })
    ]);

    // Get ALL income transactions
    const allIncome = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: 'INCOME',
        date: { gte: firstDay, lte: lastDay }
      },
      select: {
        id: true,
        amount: true,
        description: true,
        categoryId: true,
      }
    });

    let totalAllIncome = 0;
    let totalOperationalIncome = 0;
    let totalExcludedIncome = 0;

    console.log('');
    console.log('Transacciones de INCOME:');
    allIncome.forEach((tx) => {
      const amount = Number(tx.amount);
      totalAllIncome += amount;

      const isExcluded =
        (cobroPrestamoCategory && tx.categoryId === cobroPrestamoCategory.id) ||
        (cobroDeudaCategory && tx.categoryId === cobroDeudaCategory.id);

      if (isExcluded) {
        totalExcludedIncome += amount;
        console.log(`   ❌ EXCLUIDO: $${amount.toLocaleString('es-CL')} - ${tx.description}`);
      } else {
        totalOperationalIncome += amount;
        console.log(`   ✅ INCLUIDO: $${amount.toLocaleString('es-CL')} - ${tx.description}`);
      }
    });

    console.log('');
    console.log('Resumen de Ingresos:');
    console.log(`   Total de TODOS los ingresos:     $${totalAllIncome.toLocaleString('es-CL')}`);
    console.log(`   Ingresos excluidos:              $${totalExcludedIncome.toLocaleString('es-CL')}`);
    console.log(`   INGRESOS OPERATIVOS (usados):    $${totalOperationalIncome.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('');

    // ============================================================
    // PASO 2: CALCULAR GASTOS PERSONALES (PERSONAL EXPENSES)
    // ============================================================
    console.log('📊 PASO 2: CALCULAR GASTOS PERSONALES (PERSONAL EXPENSES)');
    console.log('-'.repeat(80));

    // Find Inversiones category
    const inversionesCategory = await prisma.categoryTemplate.findFirst({
      where: { name: 'Inversiones', type: 'INCOME', parentTemplateId: null }
    });

    // Get personal expenses (excluding shared, loans, investments)
    const allExpenses = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: 'EXPENSE',
        date: { gte: firstDay, lte: lastDay }
      },
      select: {
        id: true,
        amount: true,
        description: true,
        categoryId: true,
        sharedExpenseId: true,
        loanId: true,
      }
    });

    let totalAllExpenses = 0;
    let totalPersonalExpenses = 0;
    let totalSharedExpenses = 0;
    let totalLoanExpenses = 0;
    let totalInversionExpenses = 0;

    console.log('');
    console.log('Transacciones de EXPENSE:');
    allExpenses.forEach((tx) => {
      const amount = Number(tx.amount);
      totalAllExpenses += amount;

      const isShared = tx.sharedExpenseId !== null;
      const isLoan = tx.loanId !== null;
      const isInversion = tx.categoryId === inversionesCategory?.id;

      if (isShared) {
        totalSharedExpenses += amount;
        console.log(`   🔵 COMPARTIDO (excluido): $${amount.toLocaleString('es-CL')} - ${tx.description}`);
      } else if (isLoan) {
        totalLoanExpenses += amount;
        console.log(`   🔴 PRÉSTAMO (excluido): $${amount.toLocaleString('es-CL')} - ${tx.description}`);
      } else if (isInversion) {
        totalInversionExpenses += amount;
        console.log(`   🟡 INVERSIÓN (excluida): $${amount.toLocaleString('es-CL')} - ${tx.description}`);
      } else {
        totalPersonalExpenses += amount;
        console.log(`   ✅ PERSONAL (incluido): $${amount.toLocaleString('es-CL')} - ${tx.description}`);
      }
    });

    console.log('');
    console.log('Resumen de Gastos:');
    console.log(`   Total de TODOS los gastos:       $${totalAllExpenses.toLocaleString('es-CL')}`);
    console.log(`   Gastos compartidos (excluidos):  $${totalSharedExpenses.toLocaleString('es-CL')}`);
    console.log(`   Préstamos (excluidos):           $${totalLoanExpenses.toLocaleString('es-CL')}`);
    console.log(`   Inversiones (excluidas):         $${totalInversionExpenses.toLocaleString('es-CL')}`);
    console.log(`   GASTOS PERSONALES (usados):      $${totalPersonalExpenses.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('');

    // ============================================================
    // PASO 3: CALCULAR GASTOS COMPARTIDOS (TU PARTE)
    // ============================================================
    console.log('📊 PASO 3: CALCULAR GASTOS COMPARTIDOS (TU PARTE)');
    console.log('-'.repeat(80));

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
          }
        }
      }
    });

    let totalSharedOwed = 0;

    console.log('');
    console.log('Tu parte en gastos compartidos:');
    sharedExpensesParticipant.forEach((participant, index) => {
      const amountOwed = Number(participant.amountOwed);
      totalSharedOwed += amountOwed;

      console.log(`   ${index + 1}. ${participant.expense.description}`);
      console.log(`      Total del gasto: $${Number(participant.expense.amount).toLocaleString('es-CL')}`);
      console.log(`      Tu parte: $${amountOwed.toLocaleString('es-CL')}`);
      console.log(`      Pagado: ${participant.isPaid ? 'Si' : 'No'}`);
    });

    console.log('');
    console.log('Resumen de Gastos Compartidos:');
    console.log(`   TU PARTE en compartidos (usada):  $${totalSharedOwed.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('');

    // ============================================================
    // PASO 4: CALCULAR SAVINGS
    // ============================================================
    console.log('='.repeat(80));
    console.log('💰 CÁLCULO FINAL DE SAVINGS');
    console.log('='.repeat(80));
    console.log('');

    const totalExpenses = totalPersonalExpenses + totalSharedOwed;
    const savings = totalOperationalIncome - totalExpenses;
    const savingsRate = totalOperationalIncome > 0 ? (savings / totalOperationalIncome) * 100 : 0;

    console.log('Fórmula:');
    console.log('   Savings = Ingresos Operativos - (Gastos Personales + Tu Parte Compartidos)');
    console.log('');
    console.log('Valores:');
    console.log(`   Ingresos Operativos:              $${totalOperationalIncome.toLocaleString('es-CL')}`);
    console.log(`   Gastos Personales:                $${totalPersonalExpenses.toLocaleString('es-CL')}`);
    console.log(`   Tu Parte Compartidos:             $${totalSharedOwed.toLocaleString('es-CL')}`);
    console.log(`   Total Gastos:                     $${totalExpenses.toLocaleString('es-CL')}`);
    console.log('');
    console.log(`   SAVINGS:                          $${savings.toLocaleString('es-CL')} ${savings >= 0 ? '✅' : '❌'}`);
    console.log(`   SAVINGS RATE:                     ${savingsRate.toFixed(2)}%`);
    console.log('');
    console.log('');

    // ============================================================
    // COMPARACIÓN: ANTES VS DESPUÉS
    // ============================================================
    console.log('='.repeat(80));
    console.log('📈 COMPARACIÓN: ANTES VS DESPUÉS DE LOS CAMBIOS');
    console.log('='.repeat(80));
    console.log('');

    const oldIncome = totalAllIncome; // Antes incluía todo
    const oldExpenses = totalAllExpenses - totalSharedExpenses; // Antes excluía solo shared
    const oldSavings = oldIncome - (oldExpenses + totalSharedOwed);
    const oldSavingsRate = oldIncome > 0 ? (oldSavings / oldIncome) * 100 : 0;

    console.log('ANTES (sistema antiguo):');
    console.log(`   Ingresos (incluía préstamos + cobros deuda):  $${oldIncome.toLocaleString('es-CL')}`);
    console.log(`   Gastos Personales (incluía préstamos):        $${oldExpenses.toLocaleString('es-CL')}`);
    console.log(`   Gastos Compartidos (tu parte):                $${totalSharedOwed.toLocaleString('es-CL')}`);
    console.log(`   Total Gastos:                                 $${(oldExpenses + totalSharedOwed).toLocaleString('es-CL')}`);
    console.log(`   Savings:                                      $${oldSavings.toLocaleString('es-CL')}`);
    console.log(`   Savings Rate:                                 ${oldSavingsRate.toFixed(2)}%`);
    console.log('');
    console.log('DESPUÉS (con cambios implementados):');
    console.log(`   Ingresos (excluye préstamos + cobros deuda):  $${totalOperationalIncome.toLocaleString('es-CL')} ✅`);
    console.log(`   Gastos Personales (excluye préstamos):        $${totalPersonalExpenses.toLocaleString('es-CL')} ✅`);
    console.log(`   Gastos Compartidos (tu parte):                $${totalSharedOwed.toLocaleString('es-CL')} ✅`);
    console.log(`   Total Gastos:                                 $${totalExpenses.toLocaleString('es-CL')}`);
    console.log(`   Savings:                                      $${savings.toLocaleString('es-CL')} ✅`);
    console.log(`   Savings Rate:                                 ${savingsRate.toFixed(2)}%`);
    console.log('');
    console.log('DIFERENCIA:');
    console.log(`   Ingresos:                                     ${(totalOperationalIncome - oldIncome).toLocaleString('es-CL')}`);
    console.log(`   Gastos:                                       ${(totalExpenses - (oldExpenses + totalSharedOwed)).toLocaleString('es-CL')}`);
    console.log(`   Savings:                                      ${(savings - oldSavings).toLocaleString('es-CL')}`);
    console.log(`   Savings Rate:                                 ${(savingsRate - oldSavingsRate).toFixed(2)}%`);
    console.log('');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeSavings();
