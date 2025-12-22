import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPedroAccounts() {
  const pedro = await prisma.user.findUnique({
    where: { email: 'pedroperez@gmail.com' }
  });

  if (!pedro) {
    console.log('❌ Usuario Pedro no encontrado');
    await prisma.$disconnect();
    return;
  }

  console.log('\n=== CUENTAS DE PEDRO PEREZ ===\n');
  console.log(`Usuario ID: ${pedro.id}`);
  console.log(`Cuenta por defecto actual: ${pedro.defaultSharedExpenseAccountId || 'NO CONFIGURADA'}\n`);

  const accounts = await prisma.account.findMany({
    where: {
      userId: pedro.id
    },
    select: {
      id: true,
      name: true,
      type: true,
      currency: true,
      balance: true,
      isArchived: true,
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  if (accounts.length === 0) {
    console.log('❌ Pedro no tiene ninguna cuenta creada\n');
    console.log('Debe crear una cuenta primero antes de configurarla como cuenta por defecto.\n');
  } else {
    console.log(`Pedro tiene ${accounts.length} cuenta(s):\n`);

    for (const account of accounts) {
      const status = account.isArchived ? '🗄️  ARCHIVADA' : '✅ ACTIVA';
      console.log(`${status} - ${account.name}`);
      console.log(`  ID: ${account.id}`);
      console.log(`  Tipo: ${account.type}`);
      console.log(`  Moneda: ${account.currency}`);
      console.log(`  Balance: $${account.balance}`);
      console.log('');
    }

    const activeAccounts = accounts.filter(a => !a.isArchived);
    if (activeAccounts.length > 0) {
      console.log('\n📌 Para configurar la cuenta por defecto:');
      console.log('1. Pedro debe ir a: Dashboard → Settings → General');
      console.log('2. En "Cuenta por defecto para gastos compartidos" seleccionar una de sus cuentas activas');
      console.log('3. Guardar cambios\n');

      console.log('Cuentas disponibles para seleccionar:');
      activeAccounts.forEach(a => {
        console.log(`  • ${a.name} (${a.currency})`);
      });
      console.log('');
    } else {
      console.log('\n⚠️  Todas las cuentas de Pedro están archivadas.');
      console.log('Debe crear una cuenta nueva o desarchivar una existente.\n');
    }
  }

  await prisma.$disconnect();
}

checkPedroAccounts();
