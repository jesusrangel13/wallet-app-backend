import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUserTransactions() {
  const userEmail = 'jesusrangel.255@gmail.com';

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      return;
    }

    console.log(`\n✅ User found: ${user.name} (${user.email})`);
    console.log(`User ID: ${user.id}\n`);

    // Get all transactions
    const allTransactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        description: true,
        categoryId: true,
        type: true,
        amount: true,
        date: true,
      },
      orderBy: { date: 'desc' },
    });

    console.log(`📊 Total transactions: ${allTransactions.length}\n`);

    // Count transactions with and without category
    const withCategory = allTransactions.filter(t => t.categoryId !== null);
    const withoutCategory = allTransactions.filter(t => t.categoryId === null);

    console.log(`✅ Transactions WITH category: ${withCategory.length}`);
    console.log(`❌ Transactions WITHOUT category: ${withoutCategory.length}\n`);

    if (withoutCategory.length > 0) {
      console.log(`\n📋 Transactions WITHOUT category (first 10):`);
      console.log(`${'='.repeat(80)}`);
      withoutCategory.slice(0, 10).forEach((t, index) => {
        console.log(`${index + 1}. ${t.description || '(no description)'}`);
        console.log(`   Date: ${t.date.toISOString().split('T')[0]}`);
        console.log(`   Type: ${t.type}`);
        console.log(`   Amount: ${t.amount}`);
        console.log(`   Category ID: ${t.categoryId || 'NULL'}`);
        console.log('');
      });
    }

    // Check if categoryIds are valid
    if (withCategory.length > 0) {
      const categoryIds = [...new Set(withCategory.map(t => t.categoryId).filter(id => id !== null))];
      console.log(`\n🔍 Checking ${categoryIds.length} unique category IDs...\n`);

      for (const categoryId of categoryIds) {
        // Check in CategoryTemplate
        const template = await prisma.categoryTemplate.findUnique({
          where: { id: categoryId! },
          select: { id: true, name: true, type: true },
        });

        // Check in UserCategoryOverride
        const override = await prisma.userCategoryOverride.findFirst({
          where: { id: categoryId!, userId: user.id, isActive: true },
          select: { id: true, name: true, type: true },
        });

        const found = template || override;
        const source = template ? 'CategoryTemplate' : override ? 'UserCategoryOverride' : 'NOT FOUND';
        const status = found ? '✅' : '❌';

        console.log(`${status} ${categoryId?.slice(0, 8)} - ${source} ${found ? `(${found.name})` : ''}`);

        // If not found, find transactions using this category
        if (!found) {
          const affectedTransactions = allTransactions.filter(t => t.categoryId === categoryId);
          console.log(`   ⚠️  ${affectedTransactions.length} transactions using this invalid category ID`);
        }
      }
    }

    // Check for recent transactions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTransactions = allTransactions.filter(t => t.date >= thirtyDaysAgo);
    const recentUncategorized = recentTransactions.filter(t => t.categoryId === null);

    console.log(`\n📅 Recent transactions (last 30 days): ${recentTransactions.length}`);
    console.log(`❌ Recent uncategorized: ${recentUncategorized.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserTransactions();
