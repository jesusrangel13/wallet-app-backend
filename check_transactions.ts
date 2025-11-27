import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTransactions() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: ['pedroperez@gmail.com', 'juanperez@gmail.com']
      }
    }
  });

  console.log('\n=== TRANSACCIONES CREADAS HOY ===\n');

  for (const user of users) {
    console.log(`Usuario: ${user.name} (${user.email})`);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        date: {
          gte: new Date('2025-11-24T00:00:00Z')
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    if (transactions.length === 0) {
      console.log('  ❌ NO tiene transacciones creadas hoy\n');
    } else {
      console.log(`  ✅ Tiene ${transactions.length} transacción(es):\n`);
      for (const t of transactions) {
        console.log(`    - ${t.type}: $${t.amount}`);
        console.log(`      Descripción: ${t.description}`);
        console.log(`      Fecha: ${t.date.toISOString()}\n`);
      }
    }
  }

  await prisma.$disconnect();
}

checkTransactions();
