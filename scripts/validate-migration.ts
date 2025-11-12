/**
 * Validation script for category template migration
 * Verifies that data integrity is maintained after migration
 *
 * Run with: npx ts-node scripts/validate-migration.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ValidationReport {
  totalUsers: number;
  totalLegacyCategories: number;
  totalOverrides: number;
  totalCustomCategories: number;
  issues: string[];
  warnings: string[];
  orphanedTransactions: number;
}

async function validateMigration() {
  console.log('\n🔍 Validating category template migration...\n');

  const report: ValidationReport = {
    totalUsers: 0,
    totalLegacyCategories: 0,
    totalOverrides: 0,
    totalCustomCategories: 0,
    issues: [],
    warnings: [],
    orphanedTransactions: 0,
  };

  try {
    // Count totals
    const userCount = await prisma.user.count();
    const legacyCategoryCount = await prisma.category.count();
    const overrideCount = await prisma.userCategoryOverride.count();
    const customCategoryCount = await prisma.userCategoryOverride.count({
      where: { isCustom: true },
    });

    report.totalUsers = userCount;
    report.totalLegacyCategories = legacyCategoryCount;
    report.totalOverrides = overrideCount;
    report.totalCustomCategories = customCategoryCount;

    console.log(`📊 Database Statistics:`);
    console.log(`  Users: ${userCount}`);
    console.log(`  Legacy categories (old table): ${legacyCategoryCount}`);
    console.log(`  Category overrides (new table): ${overrideCount}`);
    console.log(`  Custom categories: ${customCategoryCount}`);
    console.log(`  Template categories: ${overrideCount - customCategoryCount}\n`);

    // Check 1: Verify all templates are initialized
    const templateCount = await prisma.categoryTemplate.count();
    if (templateCount !== 80) {
      report.warnings.push(
        `Expected 80 templates but found ${templateCount} (might be OK if not all templates needed)`
      );
    } else {
      console.log(`✓ All 80 category templates initialized\n`);
    }

    // Check 2: Look for orphaned transactions
    const transactionsWithoutCategory = await prisma.transaction.count({
      where: { categoryId: { not: null } },
    });

    const orphanedTransactions = await prisma.transaction.findMany({
      where: {
        categoryId: { not: null },
        category: null,
      },
      select: { id: true, userId: true, categoryId: true },
      take: 5,
    });

    if (orphanedTransactions.length > 0) {
      report.orphanedTransactions = orphanedTransactions.length;
      report.issues.push(
        `Found ${orphanedTransactions.length} transactions with non-existent categories. Examples: ${orphanedTransactions.map((t) => t.categoryId).join(', ')}`
      );
    } else {
      console.log(`✓ No orphaned transactions found\n`);
    }

    // Check 3: Verify user overrides reference valid templates or are custom
    const invalidOverrides = await prisma.userCategoryOverride.findMany({
      where: {
        AND: [
          { templateId: { not: null } },
          {
            template: null,
          },
        ],
      },
      select: { id: true, userId: true, templateId: true },
      take: 5,
    });

    if (invalidOverrides.length > 0) {
      report.issues.push(
        `Found ${invalidOverrides.length} overrides referencing non-existent templates`
      );
    } else {
      console.log(
        `✓ All non-custom overrides reference valid templates\n`
      );
    }

    // Check 4: Verify no duplicate overrides per user/template
    const duplicateOverrides = await prisma.$queryRaw`
      SELECT "user_id", "template_id", COUNT(*) as count
      FROM "user_category_overrides"
      WHERE "template_id" IS NOT NULL
      GROUP BY "user_id", "template_id"
      HAVING COUNT(*) > 1
      LIMIT 5
    `;

    if (
      Array.isArray(duplicateOverrides) &&
      duplicateOverrides.length > 0
    ) {
      report.issues.push(
        `Found ${duplicateOverrides.length} duplicate overrides per user/template`
      );
    } else {
      console.log(`✓ No duplicate overrides found\n`);
    }

    // Check 5: Sample verify some users
    const sampleUsers = await prisma.user.findMany({
      take: 3,
      select: {
        id: true,
        email: true,
        categoryOverrides: {
          select: { id: true, templateId: true, isCustom: true },
        },
      },
    });

    console.log(`📋 Sample Users Verification (showing 3 users):\n`);
    for (const user of sampleUsers) {
      const customCount = user.categoryOverrides.filter(
        (o) => o.isCustom
      ).length;
      const templateOverrideCount = user.categoryOverrides.filter(
        (o) => !o.isCustom
      ).length;

      console.log(`  ${user.email}:`);
      console.log(`    - Total overrides: ${user.categoryOverrides.length}`);
      console.log(`    - Custom categories: ${customCount}`);
      console.log(`    - Template overrides: ${templateOverrideCount}`);
    }

    console.log('');

    // Check 6: Verify migration completeness
    const usersWithLegacyCategories = await prisma.user.findMany({
      where: {
        categories: {
          some: {},
        },
      },
      select: { email: true },
      take: 5,
    });

    if (usersWithLegacyCategories.length > 0) {
      report.warnings.push(
        `Found ${usersWithLegacyCategories.length} users still with legacy categories. Migration may not be complete. Examples: ${usersWithLegacyCategories.map((u) => u.email).join(', ')}`
      );
    } else {
      console.log(`✓ No users with unprocessed legacy categories\n`);
    }

    // Print summary
    console.log('='.repeat(70));
    console.log('📋 Validation Report');
    console.log('='.repeat(70));

    if (report.issues.length === 0 && report.warnings.length === 0) {
      console.log('\n✅ All validation checks passed! Migration looks good.\n');
    } else {
      if (report.issues.length > 0) {
        console.log('\n❌ Issues found:');
        report.issues.forEach((issue) => console.log(`  - ${issue}`));
      }

      if (report.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        report.warnings.forEach((warning) =>
          console.log(`  - ${warning}`)
        );
      }

      console.log('');
    }

    console.log('='.repeat(70) + '\n');

    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Validation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

validateMigration();
