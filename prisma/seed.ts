import { PrismaClient } from '@prisma/client';
import { CategoryTemplateService } from '../src/services/categoryTemplate.service';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  try {
    // Initialize default category templates
    await CategoryTemplateService.initializeDefaultTemplates();

    console.log('✓ Seeding completed successfully');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
