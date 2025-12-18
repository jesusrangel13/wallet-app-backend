import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORY_TEMPLATES } from '../src/data/categoryTemplates';

const prisma = new PrismaClient();

interface CategoryMapping {
  id: string;
  name: string;
  parentName: string | null;
  translationKey: string;
}

// Helper para convertir nombre español a key camelCase
function toTranslationKey(name: string, parentKey?: string): string {
  // Mapeo manual de nombres a keys de traducción
  const keyMap: Record<string, string> = {
    // EXPENSE - Parents
    'Comida y Bebidas': 'categories.expense.foodAndDrinks.name',
    'Transporte': 'categories.expense.transport.name',
    'Compras': 'categories.expense.shopping.name',
    'Entretenimiento': 'categories.expense.entertainment.name',
    'Servicios': 'categories.expense.services.name',
    'Salud': 'categories.expense.health.name',
    'Educación': 'categories.expense.education.name',
    'Vivienda': 'categories.expense.housing.name',
    'Viajes': 'categories.expense.travel.name',
    'Otros Gastos': 'categories.expense.other.name',

    // INCOME - Parents
    'Salario': 'categories.income.salary.name',
    'Negocio': 'categories.income.business.name',
    'Inversiones': 'categories.income.investments.name',
    'Otros Ingresos': 'categories.income.other.name',

    // TRANSFER
    'Transferencia entre cuentas': 'categories.transfer.betweenAccounts.name',

    // EXPENSE - Comida y Bebidas children
    'Restaurant': 'categories.expense.foodAndDrinks.restaurant',
    'Delivery': 'categories.expense.foodAndDrinks.delivery',
    'Bar': 'categories.expense.foodAndDrinks.bar',
    'Cafetería': 'categories.expense.foodAndDrinks.cafe',
    'Supermercado': 'categories.expense.foodAndDrinks.supermarket',

    // EXPENSE - Transporte children
    'Taxi/Uber': 'categories.expense.transport.taxi',
    'Combustible': 'categories.expense.transport.fuel',
    'Transporte Público': 'categories.expense.transport.public',
    'Estacionamiento': 'categories.expense.transport.parking',
    'Mantenimiento Vehículo': 'categories.expense.transport.maintenance',

    // EXPENSE - Compras children
    'Ropa': 'categories.expense.shopping.clothing',
    'Electrónica': 'categories.expense.shopping.electronics',
    'Hogar': 'categories.expense.shopping.home',
    // Note: 'Libros' appears in both Compras and Educación - handled below
    // Note: 'Otros' appears in multiple categories - handled below

    // EXPENSE - Entretenimiento children
    'Cine': 'categories.expense.entertainment.cinema',
    'Videojuegos': 'categories.expense.entertainment.videogames',
    'Streaming': 'categories.expense.entertainment.streaming',
    'Eventos': 'categories.expense.entertainment.events',
    'Hobbies': 'categories.expense.entertainment.hobbies',

    // EXPENSE - Servicios children
    'Internet': 'categories.expense.services.internet',
    'Electricidad': 'categories.expense.services.electricity',
    'Agua': 'categories.expense.services.water',
    'Teléfono': 'categories.expense.services.phone',
    'Gas': 'categories.expense.services.gas',

    // EXPENSE - Salud children
    'Doctor': 'categories.expense.health.doctor',
    'Medicinas': 'categories.expense.health.medicine',
    'Dentista': 'categories.expense.health.dentist',
    'Psicólogo': 'categories.expense.health.psychologist',
    'Seguros': 'categories.expense.health.insurance',

    // EXPENSE - Educación children
    'Cursos': 'categories.expense.education.courses',
    // 'Libros' handled contextually based on parent
    'Matrícula': 'categories.expense.education.tuition',
    'Materiales': 'categories.expense.education.materials',
    'Conferencias': 'categories.expense.education.conferences',

    // EXPENSE - Vivienda children
    'Arriendo': 'categories.expense.housing.rent',
    'Hipoteca': 'categories.expense.housing.mortgage',
    'Reparaciones': 'categories.expense.housing.repairs',
    'Muebles': 'categories.expense.housing.furniture',
    'Decoración': 'categories.expense.housing.decoration',

    // EXPENSE - Viajes children
    'Vuelos': 'categories.expense.travel.flights',
    'Hoteles': 'categories.expense.travel.hotels',
    'Tours': 'categories.expense.travel.tours',
    'Transporte Local': 'categories.expense.travel.localTransport',
    'Comida': 'categories.expense.travel.food',

    // EXPENSE - Otros Gastos children
    'Regalos': 'categories.expense.other.gifts',
    'Donaciones': 'categories.expense.other.donations',
    'Mascotas': 'categories.expense.other.pets',
    'Impuestos': 'categories.expense.other.taxes',
    'Miscellaneous': 'categories.expense.other.miscellaneous',
    'Pago de deuda': 'categories.expense.other.debtPayment',
    'Préstamo otorgado': 'categories.expense.other.loanGiven',

    // INCOME - Salario children
    'Salario Base': 'categories.income.salary.baseSalary',
    'Bonificación': 'categories.income.salary.bonus',
    'Comisión': 'categories.income.salary.commission',
    'Horas Extra': 'categories.income.salary.overtime',

    // INCOME - Negocio children
    'Ventas': 'categories.income.business.sales',
    // 'Servicios' handled contextually based on parent
    'Consultoría': 'categories.income.business.consulting',
    'Freelance': 'categories.income.business.freelance',

    // INCOME - Inversiones children
    'Dividendos': 'categories.income.investments.dividends',
    'Intereses': 'categories.income.investments.interest',
    'Ganancias Bolsa': 'categories.income.investments.stockGains',
    'Rentas': 'categories.income.investments.rent',

    // INCOME - Otros Ingresos children
    'Reembolsos': 'categories.income.other.refunds',
    'Herencias': 'categories.income.other.inheritance',
    'Apuestas': 'categories.income.other.gambling',
    // 'Otros' handled contextually based on parent
    'Cobro de deuda': 'categories.income.other.debtCollection',
    'Cobro de préstamo': 'categories.income.other.loanRepayment',
  };

  // Handle duplicate names based on parent context
  if (parentKey) {
    const contextKey = `${parentKey}_${name}`;
    const contextMap: Record<string, string> = {
      'Compras_Libros': 'categories.expense.shopping.books',
      'Compras_Otros': 'categories.expense.shopping.other',
      'Educación_Libros': 'categories.expense.education.books',
      'Servicios_Servicios': 'categories.expense.services.services', // Parent category
      'Negocio_Servicios': 'categories.income.business.services',
      'Otros Gastos_Otros': 'categories.expense.other.other',
      'Otros Ingresos_Otros': 'categories.income.other.other',
    };

    if (contextMap[contextKey]) {
      return contextMap[contextKey];
    }
  }

  return keyMap[name] || `categories.unknown.${name}`;
}

async function main() {
  console.log('🔍 Fetching category templates from database...\n');

  const templates = await prisma.categoryTemplate.findMany({
    orderBy: [{ type: 'asc' }, { orderIndex: 'asc' }],
    include: {
      parent: true,
    },
  });

  console.log(`✅ Found ${templates.length} templates\n`);

  const mappings: CategoryMapping[] = [];

  for (const template of templates) {
    const parentName = template.parent?.name || null;
    const translationKey = toTranslationKey(template.name, parentName || undefined);

    mappings.push({
      id: template.id,
      name: template.name,
      parentName,
      translationKey,
    });
  }

  // Generate TypeScript mapping file content
  console.log('📝 Generating categoryMappings.ts content:\n');
  console.log('='.repeat(80));
  console.log(`/**
 * Mapeo de templateId (UUID de BD) a claves de traducción i18n
 *
 * Este archivo mapea cada categoría template del sistema a su clave de traducción.
 * - Categorías con templateId: se traducen usando este mapeo
 * - Categorías sin templateId (custom): se muestran con su nombre original
 *
 * Generado automáticamente el ${new Date().toISOString().split('T')[0]}
 */
export const categoryTemplateIdToTranslationKey: Record<string, string> = {`);

  for (const mapping of mappings) {
    const comment = mapping.parentName ? ` // ${mapping.parentName} > ${mapping.name}` : ` // ${mapping.name}`;
    console.log(`  '${mapping.id}': '${mapping.translationKey}',${comment}`);
  }

  console.log('};');
  console.log('='.repeat(80));

  console.log(`\n✅ Generated mapping for ${mappings.length} categories`);
  console.log('\nCopy the content above to: frontend/src/i18n/categoryMappings.ts\n');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  });
