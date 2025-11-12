import { TransactionType } from '@prisma/client';

interface CategoryTemplateData {
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
  parentName?: string; // Name of parent category (null for root)
  orderIndex: number;
}

// 80 default categories organized hierarchically
export const DEFAULT_CATEGORY_TEMPLATES: CategoryTemplateData[] = [
  // ========================================
  // EXPENSE CATEGORIES (10 main + 50 sub = 60)
  // ========================================

  // 1. Comida y Bebidas
  { name: 'Comida y Bebidas', icon: '🍔', color: '#FF6B6B', type: 'EXPENSE', orderIndex: 1 },
  { name: 'Restaurant', icon: '🍽️', color: '#FF8787', type: 'EXPENSE', parentName: 'Comida y Bebidas', orderIndex: 1 },
  { name: 'Delivery', icon: '🛵', color: '#FF8787', type: 'EXPENSE', parentName: 'Comida y Bebidas', orderIndex: 2 },
  { name: 'Bar', icon: '🍺', color: '#FF8787', type: 'EXPENSE', parentName: 'Comida y Bebidas', orderIndex: 3 },
  { name: 'Cafetería', icon: '☕', color: '#FF8787', type: 'EXPENSE', parentName: 'Comida y Bebidas', orderIndex: 4 },
  { name: 'Supermercado', icon: '🛒', color: '#FF8787', type: 'EXPENSE', parentName: 'Comida y Bebidas', orderIndex: 5 },

  // 2. Transporte
  { name: 'Transporte', icon: '🚗', color: '#4ECDC4', type: 'EXPENSE', orderIndex: 2 },
  { name: 'Taxi/Uber', icon: '🚕', color: '#5FE3D6', type: 'EXPENSE', parentName: 'Transporte', orderIndex: 1 },
  { name: 'Combustible', icon: '⛽', color: '#5FE3D6', type: 'EXPENSE', parentName: 'Transporte', orderIndex: 2 },
  { name: 'Transporte Público', icon: '🚌', color: '#5FE3D6', type: 'EXPENSE', parentName: 'Transporte', orderIndex: 3 },
  { name: 'Estacionamiento', icon: '🅿️', color: '#5FE3D6', type: 'EXPENSE', parentName: 'Transporte', orderIndex: 4 },
  { name: 'Mantenimiento Vehículo', icon: '🔧', color: '#5FE3D6', type: 'EXPENSE', parentName: 'Transporte', orderIndex: 5 },

  // 3. Compras
  { name: 'Compras', icon: '🛍️', color: '#95E1D3', type: 'EXPENSE', orderIndex: 3 },
  { name: 'Ropa', icon: '👕', color: '#A8EFE0', type: 'EXPENSE', parentName: 'Compras', orderIndex: 1 },
  { name: 'Electrónica', icon: '📱', color: '#A8EFE0', type: 'EXPENSE', parentName: 'Compras', orderIndex: 2 },
  { name: 'Hogar', icon: '🏠', color: '#A8EFE0', type: 'EXPENSE', parentName: 'Compras', orderIndex: 3 },
  { name: 'Libros', icon: '📚', color: '#A8EFE0', type: 'EXPENSE', parentName: 'Compras', orderIndex: 4 },
  { name: 'Otros', icon: '📦', color: '#A8EFE0', type: 'EXPENSE', parentName: 'Compras', orderIndex: 5 },

  // 4. Entretenimiento
  { name: 'Entretenimiento', icon: '🎮', color: '#F38181', type: 'EXPENSE', orderIndex: 4 },
  { name: 'Cine', icon: '🎬', color: '#F5A5A5', type: 'EXPENSE', parentName: 'Entretenimiento', orderIndex: 1 },
  { name: 'Videojuegos', icon: '🎯', color: '#F5A5A5', type: 'EXPENSE', parentName: 'Entretenimiento', orderIndex: 2 },
  { name: 'Streaming', icon: '📺', color: '#F5A5A5', type: 'EXPENSE', parentName: 'Entretenimiento', orderIndex: 3 },
  { name: 'Eventos', icon: '🎪', color: '#F5A5A5', type: 'EXPENSE', parentName: 'Entretenimiento', orderIndex: 4 },
  { name: 'Hobbies', icon: '🎨', color: '#F5A5A5', type: 'EXPENSE', parentName: 'Entretenimiento', orderIndex: 5 },

  // 5. Servicios
  { name: 'Servicios', icon: '🔌', color: '#AA96DA', type: 'EXPENSE', orderIndex: 5 },
  { name: 'Internet', icon: '📡', color: '#C2B5EC', type: 'EXPENSE', parentName: 'Servicios', orderIndex: 1 },
  { name: 'Electricidad', icon: '💡', color: '#C2B5EC', type: 'EXPENSE', parentName: 'Servicios', orderIndex: 2 },
  { name: 'Agua', icon: '💧', color: '#C2B5EC', type: 'EXPENSE', parentName: 'Servicios', orderIndex: 3 },
  { name: 'Teléfono', icon: '☎️', color: '#C2B5EC', type: 'EXPENSE', parentName: 'Servicios', orderIndex: 4 },
  { name: 'Gas', icon: '🔥', color: '#C2B5EC', type: 'EXPENSE', parentName: 'Servicios', orderIndex: 5 },

  // 6. Salud
  { name: 'Salud', icon: '⚕️', color: '#FCBAD3', type: 'EXPENSE', orderIndex: 6 },
  { name: 'Doctor', icon: '👨‍⚕️', color: '#FDD0E0', type: 'EXPENSE', parentName: 'Salud', orderIndex: 1 },
  { name: 'Medicinas', icon: '💊', color: '#FDD0E0', type: 'EXPENSE', parentName: 'Salud', orderIndex: 2 },
  { name: 'Dentista', icon: '🦷', color: '#FDD0E0', type: 'EXPENSE', parentName: 'Salud', orderIndex: 3 },
  { name: 'Psicólogo', icon: '🧠', color: '#FDD0E0', type: 'EXPENSE', parentName: 'Salud', orderIndex: 4 },
  { name: 'Seguros', icon: '🛡️', color: '#FDD0E0', type: 'EXPENSE', parentName: 'Salud', orderIndex: 5 },

  // 7. Educación
  { name: 'Educación', icon: '🎓', color: '#A0C4FF', type: 'EXPENSE', orderIndex: 7 },
  { name: 'Cursos', icon: '📖', color: '#C1DFFF', type: 'EXPENSE', parentName: 'Educación', orderIndex: 1 },
  { name: 'Libros', icon: '📕', color: '#C1DFFF', type: 'EXPENSE', parentName: 'Educación', orderIndex: 2 },
  { name: 'Matrícula', icon: '🎒', color: '#C1DFFF', type: 'EXPENSE', parentName: 'Educación', orderIndex: 3 },
  { name: 'Materiales', icon: '✏️', color: '#C1DFFF', type: 'EXPENSE', parentName: 'Educación', orderIndex: 4 },
  { name: 'Conferencias', icon: '🎤', color: '#C1DFFF', type: 'EXPENSE', parentName: 'Educación', orderIndex: 5 },

  // 8. Vivienda
  { name: 'Vivienda', icon: '🏠', color: '#FFE66D', type: 'EXPENSE', orderIndex: 8 },
  { name: 'Arriendo', icon: '🔑', color: '#FFF5A6', type: 'EXPENSE', parentName: 'Vivienda', orderIndex: 1 },
  { name: 'Hipoteca', icon: '🏘️', color: '#FFF5A6', type: 'EXPENSE', parentName: 'Vivienda', orderIndex: 2 },
  { name: 'Reparaciones', icon: '🔨', color: '#FFF5A6', type: 'EXPENSE', parentName: 'Vivienda', orderIndex: 3 },
  { name: 'Muebles', icon: '🛋️', color: '#FFF5A6', type: 'EXPENSE', parentName: 'Vivienda', orderIndex: 4 },
  { name: 'Decoración', icon: '🖼️', color: '#FFF5A6', type: 'EXPENSE', parentName: 'Vivienda', orderIndex: 5 },

  // 9. Viajes
  { name: 'Viajes', icon: '✈️', color: '#B4E7FF', type: 'EXPENSE', orderIndex: 9 },
  { name: 'Vuelos', icon: '🛫', color: '#D4F1FF', type: 'EXPENSE', parentName: 'Viajes', orderIndex: 1 },
  { name: 'Hoteles', icon: '🏨', color: '#D4F1FF', type: 'EXPENSE', parentName: 'Viajes', orderIndex: 2 },
  { name: 'Tours', icon: '🗺️', color: '#D4F1FF', type: 'EXPENSE', parentName: 'Viajes', orderIndex: 3 },
  { name: 'Transporte Local', icon: '🚖', color: '#D4F1FF', type: 'EXPENSE', parentName: 'Viajes', orderIndex: 4 },
  { name: 'Comida', icon: '🍽️', color: '#D4F1FF', type: 'EXPENSE', parentName: 'Viajes', orderIndex: 5 },

  // 10. Otros Gastos
  { name: 'Otros Gastos', icon: '📌', color: '#C7CEEA', type: 'EXPENSE', orderIndex: 10 },
  { name: 'Regalos', icon: '🎁', color: '#DCD5E8', type: 'EXPENSE', parentName: 'Otros Gastos', orderIndex: 1 },
  { name: 'Donaciones', icon: '❤️', color: '#DCD5E8', type: 'EXPENSE', parentName: 'Otros Gastos', orderIndex: 2 },
  { name: 'Mascotas', icon: '🐕', color: '#DCD5E8', type: 'EXPENSE', parentName: 'Otros Gastos', orderIndex: 3 },
  { name: 'Impuestos', icon: '📋', color: '#DCD5E8', type: 'EXPENSE', parentName: 'Otros Gastos', orderIndex: 4 },
  { name: 'Miscellaneous', icon: '🔮', color: '#DCD5E8', type: 'EXPENSE', parentName: 'Otros Gastos', orderIndex: 5 },

  // ========================================
  // INCOME CATEGORIES (4 main + 16 sub = 20)
  // ========================================

  // 1. Salario
  { name: 'Salario', icon: '💰', color: '#00B894', type: 'INCOME', orderIndex: 1 },
  { name: 'Salario Base', icon: '💵', color: '#55EFC4', type: 'INCOME', parentName: 'Salario', orderIndex: 1 },
  { name: 'Bonificación', icon: '🎁', color: '#55EFC4', type: 'INCOME', parentName: 'Salario', orderIndex: 2 },
  { name: 'Comisión', icon: '📈', color: '#55EFC4', type: 'INCOME', parentName: 'Salario', orderIndex: 3 },
  { name: 'Horas Extra', icon: '⏰', color: '#55EFC4', type: 'INCOME', parentName: 'Salario', orderIndex: 4 },

  // 2. Negocio
  { name: 'Negocio', icon: '💼', color: '#FF9FF3', type: 'INCOME', orderIndex: 2 },
  { name: 'Ventas', icon: '📦', color: '#FFC0CB', type: 'INCOME', parentName: 'Negocio', orderIndex: 1 },
  { name: 'Servicios', icon: '🛠️', color: '#FFC0CB', type: 'INCOME', parentName: 'Negocio', orderIndex: 2 },
  { name: 'Consultoría', icon: '📊', color: '#FFC0CB', type: 'INCOME', parentName: 'Negocio', orderIndex: 3 },
  { name: 'Freelance', icon: '💻', color: '#FFC0CB', type: 'INCOME', parentName: 'Negocio', orderIndex: 4 },

  // 3. Inversiones
  { name: 'Inversiones', icon: '📈', color: '#54A0FF', type: 'INCOME', orderIndex: 3 },
  { name: 'Dividendos', icon: '📊', color: '#A8D8FF', type: 'INCOME', parentName: 'Inversiones', orderIndex: 1 },
  { name: 'Intereses', icon: '💹', color: '#A8D8FF', type: 'INCOME', parentName: 'Inversiones', orderIndex: 2 },
  { name: 'Ganancias Bolsa', icon: '📉', color: '#A8D8FF', type: 'INCOME', parentName: 'Inversiones', orderIndex: 3 },
  { name: 'Rentas', icon: '🏠', color: '#A8D8FF', type: 'INCOME', parentName: 'Inversiones', orderIndex: 4 },

  // 4. Otros Ingresos
  { name: 'Otros Ingresos', icon: '🎯', color: '#FFA502', type: 'INCOME', orderIndex: 4 },
  { name: 'Reembolsos', icon: '💸', color: '#FFD93D', type: 'INCOME', parentName: 'Otros Ingresos', orderIndex: 1 },
  { name: 'Herencias', icon: '👨‍👩‍👧‍👦', color: '#FFD93D', type: 'INCOME', parentName: 'Otros Ingresos', orderIndex: 2 },
  { name: 'Apuestas', icon: '🎰', color: '#FFD93D', type: 'INCOME', parentName: 'Otros Ingresos', orderIndex: 3 },
  { name: 'Otros', icon: '⭐', color: '#FFD93D', type: 'INCOME', parentName: 'Otros Ingresos', orderIndex: 4 },
];
