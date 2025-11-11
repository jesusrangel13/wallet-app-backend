// Default categories for new users
// Following Wallet by BudgetBakers structure with main categories and subcategories

export interface DefaultCategory {
  name: string
  icon: string
  color: string
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER'
  subcategories?: Omit<DefaultCategory, 'subcategories'>[]
}

export const defaultExpenseCategories: DefaultCategory[] = [
  {
    name: 'Comida y Bebidas',
    icon: '🍽️',
    color: '#FF6B6B',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Restaurant', icon: '🍴', color: '#FF6B6B', type: 'EXPENSE' },
      { name: 'Delivery', icon: '🛵', color: '#FF6B6B', type: 'EXPENSE' },
      { name: 'Bar', icon: '🍺', color: '#FF6B6B', type: 'EXPENSE' },
      { name: 'Cafetería', icon: '☕', color: '#FF6B6B', type: 'EXPENSE' },
      { name: 'Supermercado', icon: '🛒', color: '#FF6B6B', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Transporte',
    icon: '🚗',
    color: '#4ECDC4',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Uber/Taxi', icon: '🚕', color: '#4ECDC4', type: 'EXPENSE' },
      { name: 'Combustible', icon: '⛽', color: '#4ECDC4', type: 'EXPENSE' },
      { name: 'Transporte Público', icon: '🚌', color: '#4ECDC4', type: 'EXPENSE' },
      { name: 'Estacionamiento', icon: '🅿️', color: '#4ECDC4', type: 'EXPENSE' },
      { name: 'Mantenimiento', icon: '🔧', color: '#4ECDC4', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Compras',
    icon: '🛍️',
    color: '#FFE66D',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Ropa', icon: '👔', color: '#FFE66D', type: 'EXPENSE' },
      { name: 'Electrónicos', icon: '💻', color: '#FFE66D', type: 'EXPENSE' },
      { name: 'Muebles', icon: '🪑', color: '#FFE66D', type: 'EXPENSE' },
      { name: 'Accesorios', icon: '👜', color: '#FFE66D', type: 'EXPENSE' },
      { name: 'Otros', icon: '🎁', color: '#FFE66D', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Entretenimiento',
    icon: '🎮',
    color: '#A8E6CF',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Cine', icon: '🎬', color: '#A8E6CF', type: 'EXPENSE' },
      { name: 'Eventos', icon: '🎟️', color: '#A8E6CF', type: 'EXPENSE' },
      { name: 'Streaming', icon: '📺', color: '#A8E6CF', type: 'EXPENSE' },
      { name: 'Juegos', icon: '🎮', color: '#A8E6CF', type: 'EXPENSE' },
      { name: 'Hobbies', icon: '🎨', color: '#A8E6CF', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Servicios',
    icon: '💼',
    color: '#C7CEEA',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Electricidad', icon: '💡', color: '#C7CEEA', type: 'EXPENSE' },
      { name: 'Agua', icon: '💧', color: '#C7CEEA', type: 'EXPENSE' },
      { name: 'Gas', icon: '🔥', color: '#C7CEEA', type: 'EXPENSE' },
      { name: 'Internet', icon: '🌐', color: '#C7CEEA', type: 'EXPENSE' },
      { name: 'Teléfono', icon: '📱', color: '#C7CEEA', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Salud',
    icon: '🏥',
    color: '#FF8B94',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Medicamentos', icon: '💊', color: '#FF8B94', type: 'EXPENSE' },
      { name: 'Doctor', icon: '👨‍⚕️', color: '#FF8B94', type: 'EXPENSE' },
      { name: 'Dentista', icon: '🦷', color: '#FF8B94', type: 'EXPENSE' },
      { name: 'Gimnasio', icon: '💪', color: '#FF8B94', type: 'EXPENSE' },
      { name: 'Seguros', icon: '🏥', color: '#FF8B94', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Educación',
    icon: '📚',
    color: '#FFDAC1',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Cursos', icon: '🎓', color: '#FFDAC1', type: 'EXPENSE' },
      { name: 'Libros', icon: '📖', color: '#FFDAC1', type: 'EXPENSE' },
      { name: 'Material', icon: '✏️', color: '#FFDAC1', type: 'EXPENSE' },
      { name: 'Subscripciones', icon: '📰', color: '#FFDAC1', type: 'EXPENSE' },
      { name: 'Otros', icon: '🎒', color: '#FFDAC1', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Vivienda',
    icon: '🏠',
    color: '#B5EAD7',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Arriendo', icon: '🔑', color: '#B5EAD7', type: 'EXPENSE' },
      { name: 'Hipoteca', icon: '🏦', color: '#B5EAD7', type: 'EXPENSE' },
      { name: 'Reparaciones', icon: '🔨', color: '#B5EAD7', type: 'EXPENSE' },
      { name: 'Decoración', icon: '🖼️', color: '#B5EAD7', type: 'EXPENSE' },
      { name: 'Otros', icon: '🏡', color: '#B5EAD7', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Viajes',
    icon: '✈️',
    color: '#FFB4A2',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Vuelos', icon: '✈️', color: '#FFB4A2', type: 'EXPENSE' },
      { name: 'Hoteles', icon: '🏨', color: '#FFB4A2', type: 'EXPENSE' },
      { name: 'Tours', icon: '🗺️', color: '#FFB4A2', type: 'EXPENSE' },
      { name: 'Souvenirs', icon: '🎁', color: '#FFB4A2', type: 'EXPENSE' },
      { name: 'Otros', icon: '🧳', color: '#FFB4A2', type: 'EXPENSE' },
    ],
  },
  {
    name: 'Otros Gastos',
    icon: '📋',
    color: '#D4A5A5',
    type: 'EXPENSE',
    subcategories: [
      { name: 'Impuestos', icon: '📝', color: '#D4A5A5', type: 'EXPENSE' },
      { name: 'Multas', icon: '⚠️', color: '#D4A5A5', type: 'EXPENSE' },
      { name: 'Donaciones', icon: '❤️', color: '#D4A5A5', type: 'EXPENSE' },
      { name: 'Regalos', icon: '🎁', color: '#D4A5A5', type: 'EXPENSE' },
      { name: 'Otros', icon: '💸', color: '#D4A5A5', type: 'EXPENSE' },
    ],
  },
]

export const defaultIncomeCategories: DefaultCategory[] = [
  {
    name: 'Salario',
    icon: '💰',
    color: '#6BCF7F',
    type: 'INCOME',
    subcategories: [
      { name: 'Sueldo Base', icon: '💵', color: '#6BCF7F', type: 'INCOME' },
      { name: 'Bonos', icon: '🎁', color: '#6BCF7F', type: 'INCOME' },
      { name: 'Horas Extra', icon: '⏰', color: '#6BCF7F', type: 'INCOME' },
      { name: 'Comisiones', icon: '💼', color: '#6BCF7F', type: 'INCOME' },
    ],
  },
  {
    name: 'Negocio',
    icon: '💼',
    color: '#4D96FF',
    type: 'INCOME',
    subcategories: [
      { name: 'Ventas', icon: '💳', color: '#4D96FF', type: 'INCOME' },
      { name: 'Servicios', icon: '🛠️', color: '#4D96FF', type: 'INCOME' },
      { name: 'Freelance', icon: '💻', color: '#4D96FF', type: 'INCOME' },
      { name: 'Consultoría', icon: '📊', color: '#4D96FF', type: 'INCOME' },
    ],
  },
  {
    name: 'Inversiones',
    icon: '📈',
    color: '#FFD93D',
    type: 'INCOME',
    subcategories: [
      { name: 'Dividendos', icon: '💹', color: '#FFD93D', type: 'INCOME' },
      { name: 'Intereses', icon: '🏦', color: '#FFD93D', type: 'INCOME' },
      { name: 'Ganancias Capital', icon: '📊', color: '#FFD93D', type: 'INCOME' },
      { name: 'Cripto', icon: '₿', color: '#FFD93D', type: 'INCOME' },
    ],
  },
  {
    name: 'Otros Ingresos',
    icon: '💸',
    color: '#A8DADC',
    type: 'INCOME',
    subcategories: [
      { name: 'Reembolsos', icon: '↩️', color: '#A8DADC', type: 'INCOME' },
      { name: 'Regalos', icon: '🎁', color: '#A8DADC', type: 'INCOME' },
      { name: 'Premios', icon: '🏆', color: '#A8DADC', type: 'INCOME' },
      { name: 'Otros', icon: '💵', color: '#A8DADC', type: 'INCOME' },
    ],
  },
]
