import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function configurePedroAccount() {
  console.log('\n🔧 CONFIGURANDO CUENTA POR DEFECTO DE PEDRO\n');

  // 1. Buscar a Pedro
  const pedro = await prisma.user.findUnique({
    where: { email: 'pedroperez@gmail.com' }
  });

  if (!pedro) {
    console.log('❌ Usuario Pedro no encontrado\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`✅ Usuario encontrado: ${pedro.name} (${pedro.email})`);
  console.log(`   ID: ${pedro.id}\n`);

  // 2. Buscar su cuenta "Prueba"
  const account = await prisma.account.findFirst({
    where: {
      userId: pedro.id,
      name: 'Prueba',
      isArchived: false
    }
  });

  if (!account) {
    console.log('❌ No se encontró la cuenta "Prueba" activa para Pedro\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`✅ Cuenta encontrada: ${account.name}`);
  console.log(`   ID: ${account.id}`);
  console.log(`   Tipo: ${account.type}`);
  console.log(`   Moneda: ${account.currency}`);
  console.log(`   Balance: $${account.balance}\n`);

  // 3. Actualizar usuario con la cuenta por defecto
  console.log('🔄 Configurando cuenta como cuenta por defecto para gastos compartidos...\n');

  const updatedUser = await prisma.user.update({
    where: { id: pedro.id },
    data: {
      defaultSharedExpenseAccountId: account.id
    }
  });

  console.log('✅ ¡Cuenta configurada exitosamente!\n');
  console.log('📊 Configuración actualizada:');
  console.log(`   Usuario: ${pedro.name}`);
  console.log(`   Cuenta por defecto: ${account.name} (${account.id})\n`);

  console.log('🎉 Pedro ya puede recibir pagos de gastos compartidos en su cuenta "Prueba"\n');

  await prisma.$disconnect();
}

configurePedroAccount();
