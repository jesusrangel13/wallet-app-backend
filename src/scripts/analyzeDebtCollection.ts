import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeDebtCollection() {
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

    // Find "Cobro de deuda" category (shared expense settlements)
    const cobroDeudaCategory = await prisma.categoryTemplate.findFirst({
      where: { name: 'Cobro de deuda', type: 'INCOME' }
    });

    // Find "Cobro de préstamo" category (loan repayments)
    const cobroPrestamoCategory = await prisma.categoryTemplate.findFirst({
      where: { name: 'Cobro de préstamo', type: 'INCOME' }
    });

    console.log('Categoria "Cobro de deuda" (gastos compartidos):', cobroDeudaCategory?.id || 'No encontrada');
    console.log('Categoria "Cobro de préstamo" (préstamos):', cobroPrestamoCategory?.id || 'No encontrada');
    console.log('');

    // Get ALL income transactions
    const allIncomeTransactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: 'INCOME',
        date: { gte: firstDay, lte: lastDay }
      },
      include: {
        loanPayment: true,
        sharedExpense: true
      },
      orderBy: { date: 'desc' }
    });

    console.log('='.repeat(80));
    console.log('💰 ANALISIS DE INGRESOS (INCOME)');
    console.log('='.repeat(80));
    console.log('');

    let totalIncomeAll = 0;
    let totalCobroDeuda = 0; // Shared expense settlements
    let totalCobroPrestamo = 0; // Loan repayments
    let totalOperationalIncome = 0;

    const cobroDeudaTransactions: any[] = [];
    const cobroPrestamoTransactions: any[] = [];

    console.log(`Total de transacciones INCOME: ${allIncomeTransactions.length}`);
    console.log('');

    allIncomeTransactions.forEach((tx, index) => {
      const amount = Number(tx.amount);
      const isCobroDeuda = tx.categoryId === cobroDeudaCategory?.id;
      const isCoboPrestamo = tx.categoryId === cobroPrestamoCategory?.id || tx.loanPayment;

      totalIncomeAll += amount;

      let label = '';
      if (isCobroDeuda) {
        totalCobroDeuda += amount;
        label = '🔵 COBRO DE DEUDA (Gasto compartido liquidado)';
        cobroDeudaTransactions.push(tx);
      } else if (isCoboPrestamo) {
        totalCobroPrestamo += amount;
        label = '🔴 COBRO DE PRESTAMO';
        cobroPrestamoTransactions.push(tx);
      } else {
        totalOperationalIncome += amount;
        label = '✅ INGRESO OPERATIVO';
      }

      console.log(`   ${index + 1}. ${label}`);
      console.log(`      Monto: $${amount.toLocaleString('es-CL')}`);
      console.log(`      Descripcion: ${tx.description || 'Sin descripción'}`);
      console.log(`      Fecha: ${tx.date.toISOString().split('T')[0]}`);
      console.log(`      Categoria ID: ${tx.categoryId || 'Sin categoría'}`);

      if (tx.sharedExpenseId) {
        console.log(`      ⚠️  Vinculado a SharedExpense: ${tx.sharedExpenseId}`);
      }
      if (tx.loanPayment) {
        console.log(`      ⚠️  Vinculado a LoanPayment`);
      }
      console.log('');
    });

    console.log('-'.repeat(80));
    console.log('RESUMEN INGRESOS:');
    console.log(`   Total TODOS los ingresos:           $${totalIncomeAll.toLocaleString('es-CL')}`);
    console.log(`   Cobros de deudas (compartidos):     $${totalCobroDeuda.toLocaleString('es-CL')} 🔵`);
    console.log(`   Cobros de préstamos:                $${totalCobroPrestamo.toLocaleString('es-CL')} 🔴`);
    console.log(`   Ingresos operativos:                $${totalOperationalIncome.toLocaleString('es-CL')} ✅`);
    console.log('');
    console.log('');

    console.log('='.repeat(80));
    console.log('🤔 ¿QUÉ DEBERÍA APARECER EN MONTHLY INCOME?');
    console.log('='.repeat(80));
    console.log('');

    if (totalCobroDeuda > 0) {
      console.log('⚠️  PROBLEMA ENCONTRADO:');
      console.log(`   Hay $${totalCobroDeuda.toLocaleString('es-CL')} en "Cobro de deuda" (liquidaciones de gastos compartidos)`);
      console.log('');
      console.log('   Estas transacciones SON liquidaciones de gastos compartidos:');
      cobroDeudaTransactions.forEach((tx, index) => {
        console.log(`   ${index + 1}. $${Number(tx.amount).toLocaleString('es-CL')} - ${tx.description}`);
        console.log(`      SharedExpenseId: ${tx.sharedExpenseId || 'NO VINCULADO ❌'}`);
      });
      console.log('');
      console.log('   ❌ NO deberían sumarse en Monthly Income porque:');
      console.log('      - Ya se contaron en Shared Expenses (tu parte del gasto)');
      console.log('      - Solo son liquidaciones entre participantes');
      console.log('      - No son ingresos reales, solo transferencias de deuda');
      console.log('');
    }

    if (totalCobroPrestamo > 0) {
      console.log('✅ COBROS DE PRÉSTAMOS (ya se están excluyendo con los cambios):');
      console.log(`   Total: $${totalCobroPrestamo.toLocaleString('es-CL')}`);
      console.log('   Estas transacciones NO deberían sumarse en Monthly Income');
      console.log('');
    }

    console.log('-'.repeat(80));
    console.log('IMPACTO EN MONTHLY INCOME:');
    console.log('='.repeat(80));
    console.log('');
    console.log('ESTADO ACTUAL (antes de reiniciar backend):');
    console.log(`   Monthly Income muestra:              $${totalIncomeAll.toLocaleString('es-CL')}`);
    console.log('');
    console.log('DESPUÉS de los cambios implementados (excluye "Cobro de préstamo"):');
    console.log(`   Monthly Income mostrará:             $${(totalIncomeAll - totalCobroPrestamo).toLocaleString('es-CL')}`);
    console.log(`   Reducción:                           -$${totalCobroPrestamo.toLocaleString('es-CL')}`);
    console.log('');
    console.log('⚠️  PERO TODAVÍA INCLUIRÁ:');
    console.log(`   Cobros de deudas compartidas:        $${totalCobroDeuda.toLocaleString('es-CL')} 🔵`);
    console.log('');
    console.log('SI TAMBIÉN EXCLUIMOS "Cobro de deuda":');
    console.log(`   Monthly Income mostraría:            $${totalOperationalIncome.toLocaleString('es-CL')}`);
    console.log(`   Reducción total:                     -$${(totalCobroDeuda + totalCobroPrestamo).toLocaleString('es-CL')}`);
    console.log('');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeDebtCollection();
