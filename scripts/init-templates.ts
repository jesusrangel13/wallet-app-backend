/**
 * Initialize script - Create 80 default category templates
 * Run once to seed the database with global templates
 */

import { PrismaClient } from '@prisma/client'
import { CategoryTemplateService } from '../src/services/categoryTemplate.service'

const prisma = new PrismaClient()

async function initializeTemplates() {
  try {
    console.log('\n🚀 Initializing category templates...\n')
    await CategoryTemplateService.initializeDefaultTemplates()
    console.log('\n✅ Templates initialized successfully!\n')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Error initializing templates:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

initializeTemplates()
