import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to fix orphaned category IDs in transactions
 * Maps transactions with invalid categoryIds to appropriate templates/overrides
 * based on the transaction description
 */

interface CategoryMapping {
  orphanId: string;
  newCategoryId: string | null;
  categoryName: string;
  reason: string;
}

async function findBestMatchingCategory(
  description: string,
  userId: string,
  type: string
): Promise<{ id: string; name: string } | null> {
  const descLower = description.toLowerCase();

  // Define category mapping rules based on keywords
  const categoryRules = [
    // Food & Groceries
    { keywords: ['supermercado', 'compras varias', 'carnes', 'huevos', 'potes'], templateName: 'Supermercado' },
    { keywords: ['aliexpress', 'potes', 'capsulas'], templateName: 'Compras Online' },

    // Subscriptions
    { keywords: ['netflix', 'spotify', 'hbo', 'suscripcion', 'susciprcion'], templateName: 'Suscripciones' },

    // Housing
    { keywords: ['cuota credito', 'hipoteca', 'hipotecario'], templateName: 'Hipoteca/Arriendo' },
    { keywords: ['luz', 'electricidad'], templateName: 'Luz' },
    { keywords: ['agua'], templateName: 'Agua' },
    { keywords: ['internet'], templateName: 'Internet' },

    // Phone
    { keywords: ['claro tlf', 'plan claro'], templateName: 'Teléfono' },

    // Transportation
    { keywords: ['gasolina', 'combustible'], templateName: 'Combustible' },
    { keywords: ['estacionamiento'], templateName: 'Estacionamiento' },
    { keywords: ['metro'], templateName: 'Transporte Público' },
    { keywords: ['uber'], templateName: 'Taxi/Uber' },

    // Health
    { keywords: ['examenes', 'consulta', 'endocrino', 'vitamina', 'coenzima', 'fersitol'], templateName: 'Médico' },

    // Pets
    { keywords: ['dustin', 'comida dustin', 'paz-pet', 'cleopatra'], templateName: 'Mascotas' },

    // Entertainment
    { keywords: ['hamburguesa', 'pizza', 'sushi', 'cenar'], templateName: 'Restaurantes' },
    { keywords: ['juego', 'f1'], templateName: 'Entretenimiento' },
    { keywords: ['cine'], templateName: 'Entretenimiento' },

    // Taxes & Fees
    { keywords: ['comision', 'impuestos', 'comisiones'], templateName: 'Tasas e Impuestos' },

    // Gifts
    { keywords: ['regalo'], templateName: 'Regalos' },

    // Technology
    { keywords: ['airpods', 'enchufe inteligente', 'audífonos'], templateName: 'Tecnología' },

    // Household
    { keywords: ['cabezal', 'cortina', 'ollas', 'moldes'], templateName: 'Hogar' },

    // Delivery
    { keywords: ['delivery', 'rapi'], templateName: 'Delivery' },

    // Education
    { keywords: ['libro'], templateName: 'Educación' },

    // Loans (INCOME type)
    { keywords: ['pago de préstamo', 'pago de prestamo'], templateName: 'Cobro de préstamo', forceType: 'INCOME' },

    // Loans (EXPENSE type)
    { keywords: ['préstamo a', 'prestamo a'], templateName: 'Préstamo otorgado', forceType: 'EXPENSE' },

    // Salary (INCOME)
    { keywords: ['sueldo'], templateName: 'Salario', forceType: 'INCOME' },
    { keywords: ['bono'], templateName: 'Bonos', forceType: 'INCOME' },
    { keywords: ['reembolso', 'devolucion', 'devolución'], templateName: 'Reembolsos', forceType: 'INCOME' },

    // Debt payments (INCOME for debts people pay to you)
    { keywords: ['pago publicidad', 'pago de noviembre', 'pago de su parte'], templateName: 'Cobro de deuda', forceType: 'INCOME' },
    { keywords: ['pago deuda', 'pago tdc'], templateName: 'Pago Tarjeta de Crédito', forceType: 'EXPENSE' },

    // Transfers
    { keywords: ['traspaso', 'pago de cuentas', 'pago cuentas'], templateName: null }, // Will be set to null

    // Travel
    { keywords: ['cabaña'], templateName: 'Viajes' },
  ];

  // Find matching rule
  for (const rule of categoryRules) {
    const matches = rule.keywords.some(keyword => descLower.includes(keyword));
    if (matches) {
      // If rule specifies a type and it doesn't match, skip
      if (rule.forceType && rule.forceType !== type) {
        continue;
      }

      // If templateName is null, return null (for transfers)
      if (!rule.templateName) {
        return null;
      }

      // First check for user override with this name
      const override = await prisma.userCategoryOverride.findFirst({
        where: {
          userId,
          name: { equals: rule.templateName, mode: 'insensitive' },
          isActive: true,
        },
        select: { id: true, name: true },
      });

      if (override) {
        return override;
      }

      // Then check for template with this name
      const template = await prisma.categoryTemplate.findFirst({
        where: {
          name: { equals: rule.templateName, mode: 'insensitive' },
        },
        select: { id: true, name: true },
      });

      if (template) {
        return template;
      }
    }
  }

  // If no match found, return a default "Otros" category
  const otrosTemplate = await prisma.categoryTemplate.findFirst({
    where: {
      name: { equals: 'Otros', mode: 'insensitive' },
      type: type === 'INCOME' ? 'INCOME' : 'EXPENSE',
    },
    select: { id: true, name: true },
  });

  return otrosTemplate;
}

async function fixOrphanCategories() {
  const userEmail = 'jesusrangel.255@gmail.com';

  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔧 Fixing Orphan Categories');
    console.log('='.repeat(80) + '\n');

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true, name: true },
    });

    if (!user) {
      console.log(`❌ User not found: ${userEmail}`);
      return;
    }

    console.log(`✅ User: ${user.name}\n`);

    // Get all transactions with categories
    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id, categoryId: { not: null } },
      select: {
        id: true,
        categoryId: true,
        description: true,
        type: true,
        amount: true,
        date: true,
      },
    });

    console.log(`📊 Total transactions with categories: ${transactions.length}\n`);

    // Find orphan category IDs
    const categoryIds = [...new Set(transactions.map(t => t.categoryId).filter(Boolean))];
    const orphanIds: string[] = [];

    console.log('🔍 Checking for orphan categories...\n');

    for (const categoryId of categoryIds) {
      const [template, override] = await Promise.all([
        prisma.categoryTemplate.findUnique({ where: { id: categoryId! } }),
        prisma.userCategoryOverride.findFirst({
          where: { id: categoryId!, userId: user.id, isActive: true },
        }),
      ]);

      if (!template && !override) {
        orphanIds.push(categoryId!);
      }
    }

    console.log(`❌ Found ${orphanIds.length} orphan category IDs\n`);

    if (orphanIds.length === 0) {
      console.log('✅ No orphan categories found!\n');
      return;
    }

    // Process each orphan category
    const mappings: CategoryMapping[] = [];
    let fixedCount = 0;
    let setToNullCount = 0;

    for (const orphanId of orphanIds) {
      const affectedTransactions = transactions.filter(t => t.categoryId === orphanId);
      console.log(`\n📌 Orphan ID: ${orphanId.slice(0, 8)}... (${affectedTransactions.length} transactions)`);

      // Use the first transaction's description as reference
      const sampleTransaction = affectedTransactions[0];
      console.log(`   Sample: "${sampleTransaction.description}" (${sampleTransaction.type})`);

      // Find best matching category
      const matchingCategory = await findBestMatchingCategory(
        sampleTransaction.description || '',
        user.id,
        sampleTransaction.type
      );

      if (matchingCategory) {
        console.log(`   ✅ Mapping to: ${matchingCategory.name} (${matchingCategory.id.slice(0, 8)}...)`);

        mappings.push({
          orphanId,
          newCategoryId: matchingCategory.id,
          categoryName: matchingCategory.name,
          reason: `Matched based on description keywords`,
        });

        // Update all affected transactions
        await prisma.transaction.updateMany({
          where: { categoryId: orphanId },
          data: { categoryId: matchingCategory.id },
        });

        fixedCount += affectedTransactions.length;
      } else {
        console.log(`   ℹ️  Setting to NULL (likely a transfer)`);

        mappings.push({
          orphanId,
          newCategoryId: null,
          categoryName: 'NULL',
          reason: 'No category needed (transfer or unmatched)',
        });

        // Set to null
        await prisma.transaction.updateMany({
          where: { categoryId: orphanId },
          data: { categoryId: null },
        });

        setToNullCount += affectedTransactions.length;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Summary');
    console.log('='.repeat(80));
    console.log(`✅ Fixed transactions: ${fixedCount}`);
    console.log(`ℹ️  Set to NULL: ${setToNullCount}`);
    console.log(`📋 Total orphan categories processed: ${orphanIds.length}`);
    console.log('='.repeat(80) + '\n');

    console.log('🎉 Orphan categories fixed successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixOrphanCategories();
