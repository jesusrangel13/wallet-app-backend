/**
 * Migration script to add default categories to existing users
 * Run with: npm run migrate:categories
 */

import { PrismaClient, TransactionType } from '@prisma/client';
import { defaultExpenseCategories, defaultIncomeCategories } from '../src/data/defaultCategories';

const prisma = new PrismaClient();

interface MigrationStats {
  totalUsers: number;
  usersProcessed: number;
  usersSkipped: number;
  categoriesCreated: number;
  errors: string[];
}

const stats: MigrationStats = {
  totalUsers: 0,
  usersProcessed: 0,
  usersSkipped: 0,
  categoriesCreated: 0,
  errors: [],
};

async function createDefaultCategoriesForUser(userId: string): Promise<number> {
  let categoriesCount = 0;
  const allDefaultCategories = [
    ...defaultExpenseCategories,
    ...defaultIncomeCategories,
  ];

  for (const defaultCategory of allDefaultCategories) {
    // Create main category
    const mainCategory = await prisma.category.create({
      data: {
        userId,
        name: defaultCategory.name,
        icon: defaultCategory.icon,
        color: defaultCategory.color,
        type: defaultCategory.type as TransactionType,
      },
    });

    categoriesCount++;

    // Create subcategories if they exist
    if (defaultCategory.subcategories && defaultCategory.subcategories.length > 0) {
      for (const subcategory of defaultCategory.subcategories) {
        await prisma.category.create({
          data: {
            userId,
            name: subcategory.name,
            icon: subcategory.icon,
            color: subcategory.color,
            type: subcategory.type as TransactionType,
            parentId: mainCategory.id,
          },
        });

        categoriesCount++;
      }
    }
  }

  return categoriesCount;
}

async function migrateDefaultCategories() {
  console.log('\n🔄 Starting migration of default categories...\n');

  try {
    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    stats.totalUsers = users.length;
    console.log(`Found ${stats.totalUsers} users to process\n`);

    // Process each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;

      try {
        // Check if user already has categories
        const existingCategories = await prisma.category.findFirst({
          where: { userId: user.id },
        });

        if (existingCategories) {
          console.log(`${progress} ⏭️  Skipped ${user.email} - already has categories`);
          stats.usersSkipped++;
          continue;
        }

        // Create default categories for this user
        const categoriesCreated = await createDefaultCategoriesForUser(user.id);

        console.log(
          `${progress} ✅ Created ${categoriesCreated} categories for ${user.email}`
        );

        stats.usersProcessed++;
        stats.categoriesCreated += categoriesCreated;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`${progress} ❌ Error processing ${user.email}: ${errorMsg}`);
        stats.errors.push(`${user.email}: ${errorMsg}`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total users: ${stats.totalUsers}`);
    console.log(`Users processed: ${stats.usersProcessed}`);
    console.log(`Users skipped: ${stats.usersSkipped}`);
    console.log(`Categories created: ${stats.categoriesCreated}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach((error) => console.log(`  - ${error}`));
    }

    console.log('='.repeat(60) + '\n');

    if (stats.usersProcessed > 0) {
      console.log(`✨ Successfully added default categories to ${stats.usersProcessed} users!\n`);
    } else {
      console.log('ℹ️  No users needed category migration.\n');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateDefaultCategories().then(() => {
  process.exit(0);
});
