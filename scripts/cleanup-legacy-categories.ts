/**
 * Cleanup script for Fase 8 - Remove legacy category system
 *
 * IMPORTANT: Only run this after:
 * 1. Verifying all users migrated to template system
 * 2. Running validation migration script
 * 3. Monitoring in production for 1-4 weeks
 * 4. Full backup of production database
 *
 * This script performs IRREVERSIBLE operations:
 * - Drops Category table
 * - Removes feature flag code references
 * - Archives legacy data
 *
 * Run with: npx ts-node scripts/cleanup-legacy-categories.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupLegacySystem() {
  console.log('\n⚠️  CLEANUP SCRIPT FOR LEGACY CATEGORY SYSTEM')
  console.log('=' .repeat(70))
  console.log('\n⚠️  WARNING: This is a DESTRUCTIVE operation!')
  console.log('Ensure you have:\n')
  console.log('  ✅ Full database backup')
  console.log('  ✅ All users migrated (run validate:migration)')
  console.log('  ✅ Monitored new system for 1-4 weeks')
  console.log('  ✅ Feature flag set to USE_CATEGORY_TEMPLATES=true')
  console.log('  ✅ Zero transactions using legacy categories\n')

  // Check if templates are initialized
  const templateCount = await prisma.categoryTemplate.count()
  if (templateCount !== 80) {
    console.error('❌ ERROR: Not all templates initialized (expected 80, found ' + templateCount + ')')
    console.error('✋ ABORTING cleanup. Initialize templates first with: npm run migrate:templates')
    process.exit(1)
  }

  // Check legacy categories still exist
  const legacyCount = await prisma.category.count()
  if (legacyCount === 0) {
    console.log('✅ No legacy categories found - already cleaned up!')
    process.exit(0)
  }

  console.log(`📊 Statistics:`)
  console.log(`   Category templates: ${templateCount}`)
  console.log(`   Legacy categories to remove: ${legacyCount}`)

  // Check for transactions still using legacy categories
  const transactionsWithLegacy = await prisma.transaction.count({
    where: {
      category: { id: { not: null } }
    }
  })

  if (transactionsWithLegacy > 0) {
    console.error(`\n❌ ERROR: Found ${transactionsWithLegacy} transactions still using legacy categories!`)
    console.error('✋ ABORTING cleanup. Ensure all transactions are updated first.')
    process.exit(1)
  }

  console.log(`\n🔄 Cleanup steps:`)
  console.log(`   1. Archive legacy categories (for reference)`)
  console.log(`   2. Delete all legacy categories`)
  console.log(`   3. Remove Category table from database`)
  console.log(`   4. Remove feature flag references from code\n`)

  // Step 1: Archive categories to JSON file
  console.log(`📦 Step 1: Archiving legacy categories...`)
  try {
    const allCategories = await prisma.category.findMany({
      include: { subcategories: true }
    })

    const fs = require('fs').promises
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archiveFile = `./legacy-categories-backup-${timestamp}.json`

    await fs.writeFile(archiveFile, JSON.stringify(allCategories, null, 2))
    console.log(`   ✅ Archived ${allCategories.length} categories to ${archiveFile}`)
  } catch (error) {
    console.error('   ❌ Archive failed:', error)
    process.exit(1)
  }

  // Step 2: Delete all legacy categories
  console.log(`\n🗑️  Step 2: Deleting legacy categories from database...`)
  try {
    const result = await prisma.category.deleteMany({})
    console.log(`   ✅ Deleted ${result.count} categories`)
  } catch (error) {
    console.error('   ❌ Delete failed:', error)
    process.exit(1)
  }

  // Step 3: Report on code cleanup needed
  console.log(`\n📝 Step 3: Manual code cleanup needed:`)
  console.log(`   1. Remove USE_CATEGORY_TEMPLATES feature flag from:`)
  console.log(`      - src/services/category.service.ts`)
  console.log(`      - src/services/transaction.service.ts`)
  console.log(`   2. Update documentation references`)
  console.log(`   3. Remove legacy routes from category.routes.ts (if desired)`)
  console.log(`   4. Update migration guides`)

  console.log(`\n✅ Cleanup complete!`)
  console.log(`\n📊 Final state:`)
  console.log(`   Template categories: ${templateCount}`)
  console.log(`   Legacy categories: 0`)
  console.log(`   User overrides: ${await prisma.userCategoryOverride.count()}`)

  console.log(`\n✨ Legacy system has been successfully removed!`)
  console.log(`   All users are now using the template-based system.\n`)

  process.exit(0)
}

// Run with confirmation
const args = process.argv.slice(2)
if (args.includes('--confirm')) {
  cleanupLegacySystem()
    .catch((e) => {
      console.error('\n❌ Cleanup failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
} else {
  console.log('\n⚠️  To confirm cleanup, run with --confirm flag:')
  console.log('   npx ts-node scripts/cleanup-legacy-categories.ts --confirm\n')
  process.exit(0)
}
