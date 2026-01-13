/**
 * Migration Script: Link Orphan Category Overrides to Templates
 *
 * This script finds UserCategoryOverride records that have:
 * - templateId = null
 * - isCustom = false
 *
 * And links them to matching CategoryTemplate records based on:
 * - Same name
 * - Same icon
 * - Same color
 *
 * This situation can occur when:
 * 1. A user created category overrides before templates existed
 * 2. Templates were added later with the same attributes
 *
 * Running this ensures proper category hierarchy and subcategory display.
 */

import { prisma } from '../src/utils/prisma';

async function migrateOrphanOverrides() {
  console.log('🔄 Starting migration of orphan category overrides...\n');

  // Find all overrides with null templateId and isCustom = false
  const orphans = await prisma.userCategoryOverride.findMany({
    where: {
      templateId: null,
      isCustom: false,
    },
  });

  console.log(`Found ${orphans.length} orphan override(s)\n`);

  let matched = 0;
  let notMatched = 0;

  for (const orphan of orphans) {
    // Try to find a matching template
    const template = await prisma.categoryTemplate.findFirst({
      where: {
        name: orphan.name,
        icon: orphan.icon,
        color: orphan.color,
      },
    });

    if (template) {
      console.log(`✅ Linking: ${orphan.name} -> ${template.id}`);
      await prisma.userCategoryOverride.update({
        where: { id: orphan.id },
        data: { templateId: template.id },
      });
      matched++;
    } else {
      console.log(`⚠️  No template match for: ${orphan.name}`);
      notMatched++;
    }
  }

  console.log('\n=== Migration Summary ===');
  console.log(`Matched and updated: ${matched}`);
  console.log(`No match found: ${notMatched}`);
  console.log(`Total processed: ${orphans.length}`);
}

// Run migration
migrateOrphanOverrides()
  .then(() => {
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
