import { PrismaClient, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { defaultExpenseCategories, defaultIncomeCategories } from '../data/defaultCategories';

const prisma = new PrismaClient();

interface CreateCategoryData {
  name: string;
  icon?: string;
  color?: string;
  type: TransactionType;
  parentId?: string;
}

interface UpdateCategoryData {
  name?: string;
  icon?: string;
  color?: string;
  type?: TransactionType;
  parentId?: string;
}

export const createCategory = async (userId: string, data: CreateCategoryData) => {
  // If parentId is provided, verify it exists and belongs to user
  if (data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: data.parentId, userId },
    });

    if (!parent) {
      throw new AppError('Parent category not found', 404);
    }
  }

  const category = await prisma.category.create({
    data: {
      userId,
      name: data.name,
      icon: data.icon,
      color: data.color,
      type: data.type,
      parentId: data.parentId,
    },
    include: {
      subcategories: true,
    },
  });

  return category;
};

export const getCategories = async (userId: string, type?: string) => {
  const whereClause: any = {
    userId,
    parentId: null, // Get only main categories
  };

  if (type) {
    whereClause.type = type;
  }

  const categories = await prisma.category.findMany({
    where: whereClause,
    include: {
      subcategories: {
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return categories;
};

export const getCategoryById = async (userId: string, id: string) => {
  const category = await prisma.category.findFirst({
    where: { id, userId },
    include: {
      subcategories: true,
      parent: true,
    },
  });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
};

export const updateCategory = async (
  userId: string,
  id: string,
  data: UpdateCategoryData
) => {
  // Check if category exists and belongs to user
  const existing = await prisma.category.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new AppError('Category not found', 404);
  }

  // If parentId is being updated, verify it exists
  if (data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: data.parentId, userId },
    });

    if (!parent) {
      throw new AppError('Parent category not found', 404);
    }

    // Prevent setting parent to self or creating circular reference
    if (data.parentId === id) {
      throw new AppError('Category cannot be its own parent', 400);
    }
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      name: data.name,
      icon: data.icon,
      color: data.color,
      type: data.type,
      parentId: data.parentId,
    },
    include: {
      subcategories: true,
    },
  });

  return category;
};

export const deleteCategory = async (userId: string, id: string) => {
  // Check if category exists and belongs to user
  const existing = await prisma.category.findFirst({
    where: { id, userId },
    include: {
      subcategories: true,
    },
  });

  if (!existing) {
    throw new AppError('Category not found', 404);
  }

  // Don't delete if it has subcategories
  if (existing.subcategories.length > 0) {
    throw new AppError('Cannot delete category with subcategories', 400);
  }

  await prisma.category.delete({
    where: { id },
  });

  return { success: true };
};

/**
 * Create default categories for a new user
 * Creates both expense and income categories with their subcategories
 */
export const createDefaultCategoriesForUser = async (userId: string) => {
  try {
    const allDefaultCategories = [
      ...defaultExpenseCategories,
      ...defaultIncomeCategories,
    ];

    // Create each main category with its subcategories
    for (const defaultCategory of allDefaultCategories) {
      // Create main category
      const mainCategory = await prisma.category.create({
        data: {
          userId,
          name: defaultCategory.name,
          icon: defaultCategory.icon,
          color: defaultCategory.color,
          type: defaultCategory.type as TransactionType,
        },
      });

      // Create subcategories if they exist
      if (defaultCategory.subcategories && defaultCategory.subcategories.length > 0) {
        for (const subcategory of defaultCategory.subcategories) {
          await prisma.category.create({
            data: {
              userId,
              name: subcategory.name,
              icon: subcategory.icon,
              color: subcategory.color,
              type: subcategory.type as TransactionType,
              parentId: mainCategory.id,
            },
          });
        }
      }
    }

    console.log(`✓ Default categories created for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error creating default categories for user ${userId}:`, error);
    // Don't throw - we don't want to block user registration if category creation fails
    return false;
  }
};
