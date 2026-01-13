import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function investigateOrphanCategories() {
  const userEmail = 'jesusrangel.255@gmail.com';

  try {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true },
    });

    if (!user) {
      console.log(`❌ User not found`);
      return;
    }

    console.log(`\n🔍 Investigating orphan categories for ${user.name}\n`);

    // Get all transactions with categories
    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id, categoryId: { not: null } },
      select: { id: true, categoryId: true, description: true, date: true },
    });

    const categoryIds = [...new Set(transactions.map(t => t.categoryId).filter(Boolean))];
    console.log(`Found ${categoryIds.length} unique category IDs in transactions\n`);

    const orphanCategories = [];

    for (const categoryId of categoryIds) {
      const [template, override] = await Promise.all([
        prisma.categoryTemplate.findUnique({ where: { id: categoryId! } }),
        prisma.userCategoryOverride.findFirst({
          where: { id: categoryId!, userId: user.id, isActive: true },
        }),
      ]);

      if (!template && !override) {
        const affectedTransactions = transactions.filter(t => t.categoryId === categoryId);
        orphanCategories.push({
          categoryId: categoryId!,
          count: affectedTransactions.length,
          transactions: affectedTransactions,
        });
      }
    }

    console.log(`\n❌ Found ${orphanCategories.length} orphan category IDs\n`);
    console.log('=' .repeat(80));

    for (const orphan of orphanCategories) {
      console.log(`\n📌 Orphan Category ID: ${orphan.categoryId}`);
      console.log(`   Affected transactions: ${orphan.count}`);
      console.log(`\n   Sample transactions:`);
      orphan.transactions.slice(0, 3).forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.description} (${t.date.toISOString().split('T')[0]})`);
      });

      // Check if this ID exists in the legacy Category table or was deleted
      const inactiveOverride = await prisma.userCategoryOverride.findFirst({
        where: { id: orphan.categoryId, userId: user.id },
      });

      if (inactiveOverride) {
        console.log(`   ⚠️  Found INACTIVE UserCategoryOverride: ${inactiveOverride.name} (isActive: ${inactiveOverride.isActive})`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Total orphan categories: ${orphanCategories.length}`);
    console.log(`   Total affected transactions: ${orphanCategories.reduce((sum, o) => sum + o.count, 0)}`);
    console.log('\n');

    // Export orphan data for fixing
    console.log('📋 Orphan category IDs to fix:');
    orphanCategories.forEach(o => {
      console.log(`   - ${o.categoryId} (${o.count} transactions)`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigateOrphanCategories();
