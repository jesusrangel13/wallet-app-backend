/**
 * Migration script to convert existing Category records to the new template system
 * Converts: Category table → CategoryTemplate + UserCategoryOverride
 *
 * Run with: npx ts-node scripts/migrate-to-templates.ts
 *
 * Strategy:
 * 1. For each user's Category that matches a CategoryTemplate exactly → skip (will use template)
 * 2. For each user's Category that differs from template (custom name/icon/color) → create UserCategoryOverride
 * 3. For each user's Category with no matching template (fully custom) → create UserCategoryOverride with templateId: null
 * 4. Maintain transaction relationships (categoryId → will reference override.id)
 */

import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
  totalUsers: number;
  usersProcessed: number;
  totalCategoriesAnalyzed: number;
  overridesCreated: number;
  customCategoriesCreated: number;
  categoriesSkipped: number;
  errors: string[];
}

const stats: MigrationStats = {
  totalUsers: 0,
  usersProcessed: 0,
  totalCategoriesAnalyzed: 0,
  overridesCreated: 0,
  customCategoriesCreated: 0,
  categoriesSkipped: 0,
  errors: [],
};

interface CategoryWithTemplate {
  oldId: string;
  name: string;
  icon?: string;
  color?: string;
  type: TransactionType;
  parentId?: string;
  matchingTemplate?: {
    id: string;
    name: string;
    icon?: string;
    color?: string;
  };
  newOverrideId?: string;
}

/**
 * Fuzzy match a category to a template
 * Looks for templates with same type and similar name
 */
function findMatchingTemplate(
  category: any,
  templates: Map<string, any>,
  parentTemplateId?: string
): any | null {
  // Normalize names for comparison (lowercase, trim)
  const normalizedName = category.name.toLowerCase().trim();

  for (const [, template] of templates) {
    // Match by type and parent hierarchy
    if (template.type !== category.type) continue;
    if (template.parentTemplateId !== parentTemplateId) continue;

    const normalizedTemplateName = template.name.toLowerCase().trim();

    // Exact match or very similar
    if (normalizedName === normalizedTemplateName) {
      return template;
    }

    // Fuzzy match: check if template name contains category name (for variations)
    if (
      normalizedTemplateName.includes(normalizedName) ||
      normalizedName.includes(normalizedTemplateName)
    ) {
      return template;
    }
  }

  return null;
}

/**
 * Migrate categories for a single user
 */
async function migrateUserCategories(
  userId: string,
  templatesMap: Map<string, any>
): Promise<Map<string, string>> {
  const categoryMapping = new Map<string, string>(); // oldId -> newId (override or template)

  // Get all legacy categories for this user
  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  });

  if (categories.length === 0) {
    return categoryMapping;
  }

  stats.totalCategoriesAnalyzed += categories.length;

  // First pass: process parent categories (no parentId)
  const parentCategories = categories.filter((c) => !c.parentId);

  for (const category of parentCategories) {
    try {
      const matchingTemplate = findMatchingTemplate(category, templatesMap);

      if (matchingTemplate) {
        // Category matches a template exactly (or very closely)
        const isExactMatch =
          category.name.toLowerCase() === matchingTemplate.name.toLowerCase() &&
          (category.icon === matchingTemplate.icon || !category.icon) &&
          (category.color === matchingTemplate.color || !category.color);

        if (isExactMatch) {
          // Use template as-is, no override needed
          categoryMapping.set(category.id, matchingTemplate.id);
          stats.categoriesSkipped++;
        } else {
          // Create override for custom name/icon/color
          const override = await prisma.userCategoryOverride.create({
            data: {
              userId,
              templateId: matchingTemplate.id,
              name: category.name,
              icon: category.icon,
              color: category.color,
              isActive: true,
              isCustom: false, // It's derived from template
            },
          });

          categoryMapping.set(category.id, override.id);
          stats.overridesCreated++;
        }
      } else {
        // No matching template - create as custom category
        const customCategory = await prisma.userCategoryOverride.create({
          data: {
            userId,
            templateId: null, // No template, fully custom
            name: category.name,
            icon: category.icon,
            color: category.color,
            isActive: true,
            isCustom: true,
          },
        });

        categoryMapping.set(category.id, customCategory.id);
        stats.customCategoriesCreated++;
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      stats.errors.push(`User ${userId}, Category "${category.name}": ${errorMsg}`);
    }
  }

  // Second pass: process subcategories
  const childCategories = categories.filter((c) => c.parentId);

  for (const category of childCategories) {
    try {
      const parentNewId = categoryMapping.get(category.parentId!);
      if (!parentNewId) {
        stats.errors.push(
          `User ${userId}, Subcategory "${category.name}": Parent category mapping not found`
        );
        continue;
      }

      // Get parent template to search for matching subcategory templates
      let parentTemplateId: string | undefined;

      // If parent was mapped to a template, find it
      const parentTemplate = Array.from(templatesMap.values()).find(
        (t) => t.id === parentNewId && !t.parentTemplateId
      );
      if (parentTemplate) {
        parentTemplateId = parentTemplate.id;
      }

      const matchingTemplate = findMatchingTemplate(
        category,
        templatesMap,
        parentTemplateId
      );

      if (matchingTemplate) {
        const isExactMatch =
          category.name.toLowerCase() ===
            matchingTemplate.name.toLowerCase() &&
          (category.icon === matchingTemplate.icon || !category.icon) &&
          (category.color === matchingTemplate.color || !category.color);

        if (isExactMatch) {
          categoryMapping.set(category.id, matchingTemplate.id);
          stats.categoriesSkipped++;
        } else {
          const override = await prisma.userCategoryOverride.create({
            data: {
              userId,
              templateId: matchingTemplate.id,
              name: category.name,
              icon: category.icon,
              color: category.color,
              isActive: true,
              isCustom: false,
            },
          });

          categoryMapping.set(category.id, override.id);
          stats.overridesCreated++;
        }
      } else {
        const customCategory = await prisma.userCategoryOverride.create({
          data: {
            userId,
            templateId: null,
            name: category.name,
            icon: category.icon,
            color: category.color,
            isActive: true,
            isCustom: true,
          },
        });

        categoryMapping.set(category.id, customCategory.id);
        stats.customCategoriesCreated++;
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      stats.errors.push(
        `User ${userId}, Subcategory "${category.name}": ${errorMsg}`
      );
    }
  }

  return categoryMapping;
}

async function migrateToTemplates() {
  console.log('\n🔄 Starting migration from Category to CategoryTemplate + UserCategoryOverride...\n');

  try {
    // Load all templates into memory for fast lookup
    console.log('📦 Loading category templates...');
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

    const templatesMap = new Map(templates.map((t) => [t.id, t]));
    console.log(`✓ Loaded ${templates.length} templates\n`);

    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
      },
    });

    stats.totalUsers = users.length;
    console.log(`Found ${stats.totalUsers} users to process\n`);

    // Process each user
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;

      try {
        // Check if user has any legacy categories
        const legacyCategoryCount = await prisma.category.count({
          where: { userId: user.id },
        });

        if (legacyCategoryCount === 0) {
          console.log(
            `${progress} ⏭️  ${user.email}: No legacy categories to migrate`
          );
          continue;
        }

        // Migrate this user's categories
        const categoryMapping = await migrateUserCategories(user.id, templatesMap);

        console.log(
          `${progress} ✅ ${user.email}: Migrated ${legacyCategoryCount} categories`
        );

        stats.usersProcessed++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`${progress} ❌ Error migrating ${user.email}: ${errorMsg}`);
        stats.errors.push(`${user.email}: ${errorMsg}`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 Migration Summary');
    console.log('='.repeat(70));
    console.log(`Total users: ${stats.totalUsers}`);
    console.log(`Users processed: ${stats.usersProcessed}`);
    console.log(`Total categories analyzed: ${stats.totalCategoriesAnalyzed}`);
    console.log(`Overrides created (template customizations): ${stats.overridesCreated}`);
    console.log(`Custom categories created (no template match): ${stats.customCategoriesCreated}`);
    console.log(`Categories skipped (exact template match): ${stats.categoriesSkipped}`);

    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered (${stats.errors.length}):`);
      stats.errors.slice(0, 10).forEach((error) => console.log(`  - ${error}`));
      if (stats.errors.length > 10) {
        console.log(`  ... and ${stats.errors.length - 10} more errors`);
      }
    }

    console.log('='.repeat(70) + '\n');

    if (stats.usersProcessed > 0) {
      console.log(
        `✨ Successfully migrated categories for ${stats.usersProcessed} users!\n`
      );
      console.log(
        '📝 Next steps:\n' +
          '  1. Verify migration results in database\n' +
          '  2. Update TransactionService to use new category system\n' +
          '  3. Deploy and test with real data\n' +
          '  4. Eventually drop legacy Category table (Fase 8)\n'
      );
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
migrateToTemplates().then(() => {
  process.exit(0);
});
