/**
 * Migration script to update Transaction and SharedExpense categoryIds
 * Maps legacy Category IDs to new UserCategoryOverride or CategoryTemplate IDs
 *
 * Run with: npx ts-node scripts/migrate-transaction-category-ids.ts
 *
 * Prerequisites:
 * - CategoryTemplate system must be initialized
 * - UserCategoryOverrides should already be created (run migrate-to-templates.ts first)
 */

import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
  totalTransactions: number;
  transactionsUpdated: number;
  transactionsSkipped: number;
  totalSharedExpenses: number;
  sharedExpensesUpdated: number;
  sharedExpensesSkipped: number;
  mappedToOverride: number;
  mappedToTemplate: number;
  mappedToNull: number;
  errors: string[];
}

const stats: MigrationStats = {
  totalTransactions: 0,
  transactionsUpdated: 0,
  transactionsSkipped: 0,
  totalSharedExpenses: 0,
  sharedExpensesUpdated: 0,
  sharedExpensesSkipped: 0,
  mappedToOverride: 0,
  mappedToTemplate: 0,
  mappedToNull: 0,
  errors: [],
};

/**
 * Build a mapping from legacy Category ID to new ID (Override or Template)
 */
async function buildCategoryMapping(): Promise<Map<string, { newId: string | null; source: string }>> {
  const mapping = new Map<string, { newId: string | null; source: string }>();

  console.log('📦 Building category ID mapping...');

  // Get all legacy categories
  const legacyCategories = await prisma.category.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      icon: true,
      color: true,
      type: true,
      parentId: true,
    },
  });

  console.log(`Found ${legacyCategories.length} legacy categories to map`);

  // Get all templates for reference
  const templates = await prisma.categoryTemplate.findMany({
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
      type: true,
      parentTemplateId: true,
    },
  });

  const templatesByName = new Map<string, typeof templates[0]>();
  templates.forEach((t) => {
    const key = `${t.name.toLowerCase()}_${t.type}_${t.parentTemplateId || 'root'}`;
    templatesByName.set(key, t);
  });

  // Get all user overrides
  const overrides = await prisma.userCategoryOverride.findMany({
    select: {
      id: true,
      userId: true,
      templateId: true,
      name: true,
      type: true,
      parentOverrideId: true,
    },
  });

  // Build override lookup: userId + name + type -> override
  const overridesByUserAndName = new Map<string, typeof overrides[0]>();
  overrides.forEach((o) => {
    const key = `${o.userId}_${o.name.toLowerCase()}_${o.type}`;
    overridesByUserAndName.set(key, o);
  });

  // Map each legacy category
  for (const legacy of legacyCategories) {
    // Strategy:
    // 1. First check if user has an override with matching name and type
    // 2. If not, check if there's a template with matching name and type
    // 3. If neither, set to null

    const overrideKey = `${legacy.userId}_${legacy.name.toLowerCase()}_${legacy.type}`;
    const override = overridesByUserAndName.get(overrideKey);

    if (override) {
      mapping.set(legacy.id, { newId: override.id, source: 'override' });
      stats.mappedToOverride++;
    } else {
      // Check for template match
      const templateKey = `${legacy.name.toLowerCase()}_${legacy.type}_root`;
      const template = templatesByName.get(templateKey);

      if (template) {
        mapping.set(legacy.id, { newId: template.id, source: 'template' });
        stats.mappedToTemplate++;
      } else {
        // No match found - this shouldn't happen if migrate-to-templates was run
        mapping.set(legacy.id, { newId: null, source: 'null' });
        stats.mappedToNull++;
        stats.errors.push(
          `Legacy category "${legacy.name}" (${legacy.id}) for user ${legacy.userId} has no mapping`
        );
      }
    }
  }

  console.log(`✓ Mapped ${legacyCategories.length} categories:`);
  console.log(`  - ${stats.mappedToOverride} to UserCategoryOverride`);
  console.log(`  - ${stats.mappedToTemplate} to CategoryTemplate`);
  console.log(`  - ${stats.mappedToNull} to NULL (no match)`);

  return mapping;
}

/**
 * Update all transactions with new category IDs
 */
async function migrateTransactions(
  categoryMapping: Map<string, { newId: string | null; source: string }>
): Promise<void> {
  console.log('\n🔄 Migrating Transaction categoryIds...');

  // Get all transactions with categoryId
  const transactions = await prisma.transaction.findMany({
    where: {
      categoryId: { not: null },
    },
    select: {
      id: true,
      categoryId: true,
    },
  });

  stats.totalTransactions = transactions.length;
  console.log(`Found ${transactions.length} transactions with categories`);

  // Process in batches to avoid memory issues
  const batchSize = 100;
  let processed = 0;

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const updates: { id: string; newCategoryId: string | null }[] = [];

    for (const tx of batch) {
      if (!tx.categoryId) continue;

      const mappingInfo = categoryMapping.get(tx.categoryId);
      if (mappingInfo) {
        updates.push({
          id: tx.id,
          newCategoryId: mappingInfo.newId,
        });
      } else {
        stats.transactionsSkipped++;
      }
    }

    // Batch update transactions
    if (updates.length > 0) {
      for (const update of updates) {
        try {
          await prisma.transaction.update({
            where: { id: update.id },
            data: { categoryId: update.newCategoryId },
          });
          stats.transactionsUpdated++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          stats.errors.push(`Transaction ${update.id}: ${errorMsg}`);
        }
      }
    }

    processed += batch.length;
    if (processed % 500 === 0 || processed === transactions.length) {
      console.log(`  Progress: ${processed}/${transactions.length} transactions processed`);
    }
  }

  console.log(`✓ Updated ${stats.transactionsUpdated} transactions`);
}

/**
 * Update all shared expenses with new category IDs
 */
async function migrateSharedExpenses(
  categoryMapping: Map<string, { newId: string | null; source: string }>
): Promise<void> {
  console.log('\n🔄 Migrating SharedExpense categoryIds...');

  const sharedExpenses = await prisma.sharedExpense.findMany({
    where: {
      categoryId: { not: null },
    },
    select: {
      id: true,
      categoryId: true,
    },
  });

  stats.totalSharedExpenses = sharedExpenses.length;
  console.log(`Found ${sharedExpenses.length} shared expenses with categories`);

  for (const expense of sharedExpenses) {
    if (!expense.categoryId) continue;

    const mappingInfo = categoryMapping.get(expense.categoryId);
    if (mappingInfo) {
      try {
        await prisma.sharedExpense.update({
          where: { id: expense.id },
          data: { categoryId: mappingInfo.newId },
        });
        stats.sharedExpensesUpdated++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`SharedExpense ${expense.id}: ${errorMsg}`);
      }
    } else {
      stats.sharedExpensesSkipped++;
    }
  }

  console.log(`✓ Updated ${stats.sharedExpensesUpdated} shared expenses`);
}

async function runMigration() {
  console.log('\n' + '='.repeat(70));
  console.log('🔄 Transaction & SharedExpense Category ID Migration');
  console.log('='.repeat(70) + '\n');

  try {
    // Step 1: Build the mapping
    const categoryMapping = await buildCategoryMapping();

    // Step 2: Migrate transactions
    await migrateTransactions(categoryMapping);

    // Step 3: Migrate shared expenses
    await migrateSharedExpenses(categoryMapping);

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Migration Summary');
    console.log('='.repeat(70));
    console.log(`Transactions: ${stats.transactionsUpdated}/${stats.totalTransactions} updated`);
    console.log(`Shared Expenses: ${stats.sharedExpensesUpdated}/${stats.totalSharedExpenses} updated`);
    console.log(`\nCategory mapping breakdown:`);
    console.log(`  - Mapped to UserCategoryOverride: ${stats.mappedToOverride}`);
    console.log(`  - Mapped to CategoryTemplate: ${stats.mappedToTemplate}`);
    console.log(`  - Set to NULL: ${stats.mappedToNull}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered (${stats.errors.length}):`);
      stats.errors.slice(0, 20).forEach((error) => console.log(`  - ${error}`));
      if (stats.errors.length > 20) {
        console.log(`  ... and ${stats.errors.length - 20} more errors`);
      }
    }

    console.log('='.repeat(70) + '\n');

    if (stats.transactionsUpdated > 0 || stats.sharedExpensesUpdated > 0) {
      console.log('✨ Migration completed successfully!\n');
      console.log(
        '📝 Next steps:\n' +
          '  1. Verify data integrity in database\n' +
          '  2. Update Prisma schema to remove Category model relations\n' +
          '  3. Update TransactionService to resolve categories manually\n' +
          '  4. Run Prisma migration to update schema\n' +
          '  5. Delete legacy Category table after all tests pass\n'
      );
    } else {
      console.log('ℹ️  No updates were necessary.\n');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
runMigration().then(() => {
  process.exit(0);
});
