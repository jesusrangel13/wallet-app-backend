/**
 * Script para marcar como pagados todos los expense_participants
 * de gastos compartidos anteriores al 1 de diciembre de 2025
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function markOldExpensesAsPaid() {
  try {
    console.log('🔍 Iniciando actualización de gastos antiguos...\n');

    // Fecha de corte: 1 de diciembre de 2025
    const cutoffDate = new Date('2025-12-01T00:00:00.000Z');
    console.log(`📅 Fecha de corte: ${cutoffDate.toISOString()}\n`);

    // 1. Primero, contar cuántos registros se van a actualizar
    const count = await prisma.expenseParticipant.count({
      where: {
        isPaid: false,
        expense: {
          date: {
            lt: cutoffDate,
          },
        },
      },
    });

    console.log(`📊 Registros que serán actualizados: ${count}`);

    if (count === 0) {
      console.log('✅ No hay registros para actualizar. Todos los gastos antiguos ya están marcados como pagados.');
      return;
    }

    // 2. Obtener los gastos que se van a actualizar para logging
    const expensesToUpdate = await prisma.expenseParticipant.findMany({
      where: {
        isPaid: false,
        expense: {
          date: {
            lt: cutoffDate,
          },
        },
      },
      include: {
        expense: {
          select: {
            id: true,
            description: true,
            date: true,
            amount: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      take: 10, // Mostrar solo los primeros 10 como ejemplo
    });

    console.log('\n📋 Ejemplos de gastos a actualizar (primeros 10):');
    expensesToUpdate.forEach((participant, index) => {
      console.log(`  ${index + 1}. ${participant.expense.description} - ${participant.user.name} - $${participant.amountOwed} (${participant.expense.date.toISOString().split('T')[0]})`);
    });

    // 3. Pedir confirmación
    console.log(`\n⚠️  Se actualizarán ${count} participantes de gastos compartidos.`);
    console.log('⚠️  Esta operación no se puede deshacer fácilmente.\n');

    // 4. Actualizar los registros
    console.log('🔄 Actualizando registros...\n');

    const result = await prisma.expenseParticipant.updateMany({
      where: {
        isPaid: false,
        expense: {
          date: {
            lt: cutoffDate,
          },
        },
      },
      data: {
        isPaid: true,
        paidDate: new Date(),
      },
    });

    console.log(`✅ Actualización completada: ${result.count} registros actualizados\n`);

    // 5. Verificar los cambios
    const verifyCount = await prisma.expenseParticipant.count({
      where: {
        isPaid: true,
        expense: {
          date: {
            lt: cutoffDate,
          },
        },
      },
    });

    console.log(`✅ Verificación: ${verifyCount} participantes de gastos antiguos ahora están marcados como pagados\n`);

    // 6. Mostrar resumen por usuario
    const summary = await prisma.$queryRaw<Array<{ user_name: string; total_paid: bigint }>>`
      SELECT
        u.name as user_name,
        COUNT(*) as total_paid
      FROM expense_participants ep
      JOIN users u ON ep.user_id = u.id
      JOIN shared_expenses se ON ep.expense_id = se.id
      WHERE ep.is_paid = true
        AND se.date < ${cutoffDate}
      GROUP BY u.name
      ORDER BY total_paid DESC
      LIMIT 10
    `;

    console.log('📊 Resumen por usuario (top 10):');
    summary.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.user_name}: ${row.total_paid} gastos marcados como pagados`);
    });

    console.log('\n✅ Script completado exitosamente!');
  } catch (error) {
    console.error('❌ Error al ejecutar el script:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
markOldExpensesAsPaid()
  .then(() => {
    console.log('\n👋 Fin del script');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error);
    process.exit(1);
  });
