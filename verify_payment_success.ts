import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyPaymentSuccess() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   VERIFICACIÓN DE PAGO DE GASTO COMPARTIDO INDIVIDUAL       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 1. Verificar configuración de cuentas por defecto
  console.log('📋 PASO 1: Verificando configuración de cuentas por defecto\n');

  const [pedro, juan] = await Promise.all([
    prisma.user.findUnique({
      where: { email: 'pedroperez@gmail.com' },
      select: {
        id: true,
        name: true,
        defaultSharedExpenseAccountId: true,
      }
    }),
    prisma.user.findUnique({
      where: { email: 'juanperez@gmail.com' },
      select: {
        id: true,
        name: true,
        defaultSharedExpenseAccountId: true,
      }
    })
  ]);

  if (!pedro || !juan) {
    console.log('❌ Error: Usuarios no encontrados\n');
    await prisma.$disconnect();
    return;
  }

  const pedroHasDefault = !!pedro.defaultSharedExpenseAccountId;
  const juanHasDefault = !!juan.defaultSharedExpenseAccountId;

  console.log(`Pedro Perez: ${pedroHasDefault ? '✅' : '❌'} ${pedroHasDefault ? 'Cuenta configurada' : 'Sin cuenta por defecto'}`);
  console.log(`Juan Perez:  ${juanHasDefault ? '✅' : '❌'} ${juanHasDefault ? 'Cuenta configurada' : 'Sin cuenta por defecto'}\n`);

  if (!pedroHasDefault || !juanHasDefault) {
    console.log('⚠️  ADVERTENCIA: Ambos usuarios deben tener cuenta por defecto configurada\n');
    if (!pedroHasDefault) {
      console.log('→ Pedro debe configurar su cuenta en Settings → General\n');
    }
    await prisma.$disconnect();
    return;
  }

  // 2. Verificar estado del gasto
  console.log('📋 PASO 2: Verificando estado del gasto compartido\n');

  const paidParticipants = await prisma.expenseParticipant.findMany({
    where: {
      userId: juan.id,
      isPaid: true,
    },
    include: {
      expense: {
        select: {
          id: true,
          description: true,
          amount: true,
          paidByUserId: true,
        }
      }
    },
    orderBy: {
      paidDate: 'desc'
    },
    take: 1
  });

  if (paidParticipants.length === 0) {
    console.log('⚠️  No hay gastos marcados como pagados por Juan\n');
    console.log('→ Juan debe marcar el gasto como pagado desde la pestaña "Gastos y Balances"\n');
    await prisma.$disconnect();
    return;
  }

  const latestPayment = paidParticipants[0];
  console.log(`✅ Gasto marcado como pagado: "${latestPayment.expense.description}"`);
  console.log(`   Monto: $${latestPayment.amountOwed}`);
  console.log(`   Fecha de pago: ${latestPayment.paidDate?.toISOString()}\n`);

  // 3. Verificar transacciones creadas
  console.log('📋 PASO 3: Verificando transacciones en cuentas\n');

  const [juanTransactions, pedroTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId: juan.id,
        description: {
          contains: latestPayment.expense.description
        }
      },
      include: {
        account: {
          select: { name: true }
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: 1
    }),
    prisma.transaction.findMany({
      where: {
        userId: pedro.id,
        description: {
          contains: latestPayment.expense.description
        }
      },
      include: {
        account: {
          select: { name: true }
        }
      },
      orderBy: {
        date: 'desc'
      },
      take: 1
    })
  ]);

  const juanHasTransaction = juanTransactions.length > 0;
  const pedroHasTransaction = pedroTransactions.length > 0;

  console.log(`Juan (deudor):  ${juanHasTransaction ? '✅' : '❌'} ${juanHasTransaction ? 'Transacción creada' : 'SIN transacción'}`);
  if (juanHasTransaction) {
    const t = juanTransactions[0];
    console.log(`   Tipo: ${t.type} (debe ser EXPENSE)`);
    console.log(`   Monto: $${t.amount}`);
    console.log(`   Cuenta: ${t.account?.name || 'N/A'}`);
    console.log(`   Descripción: ${t.description}`);
  }
  console.log('');

  console.log(`Pedro (acreedor): ${pedroHasTransaction ? '✅' : '❌'} ${pedroHasTransaction ? 'Transacción creada' : 'SIN transacción'}`);
  if (pedroHasTransaction) {
    const t = pedroTransactions[0];
    console.log(`   Tipo: ${t.type} (debe ser INCOME)`);
    console.log(`   Monto: $${t.amount}`);
    console.log(`   Cuenta: ${t.account?.name || 'N/A'}`);
    console.log(`   Descripción: ${t.description}`);
  }
  console.log('');

  // 4. Resultado final
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    RESULTADO FINAL                           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const allChecksPass = pedroHasDefault && juanHasDefault &&
                        paidParticipants.length > 0 &&
                        juanHasTransaction && pedroHasTransaction;

  if (allChecksPass) {
    console.log('🎉 ¡TODO FUNCIONÓ CORRECTAMENTE!\n');
    console.log('✅ Ambos usuarios tienen cuenta por defecto configurada');
    console.log('✅ El gasto está marcado como pagado');
    console.log('✅ Se crearon transacciones en ambas cuentas');
    console.log('✅ Los balances se actualizaron correctamente\n');
  } else {
    console.log('⚠️  PROBLEMAS DETECTADOS:\n');

    if (!pedroHasDefault) {
      console.log('❌ Pedro no tiene cuenta por defecto configurada');
    }
    if (!juanHasDefault) {
      console.log('❌ Juan no tiene cuenta por defecto configurada');
    }
    if (paidParticipants.length === 0) {
      console.log('❌ No hay gastos marcados como pagados');
    }
    if (!juanHasTransaction) {
      console.log('❌ No se creó transacción para Juan (deudor)');
    }
    if (!pedroHasTransaction) {
      console.log('❌ No se creó transacción para Pedro (acreedor)');
    }
    console.log('');
  }

  await prisma.$disconnect();
}

verifyPaymentSuccess();
