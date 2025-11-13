import { PrismaClient, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { defaultExpenseCategories, defaultIncomeCategories } from '../data/defaultCategories';
import { CategoryTemplateService } from './categoryTemplate.service';
import { UserCategoryService } from './userCategory.service';

const prisma = new PrismaClient();

// Template-based category system is now the default system

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
  // Template-based system: get categories from templates + overrides
  try {
    if (type) {
      return await UserCategoryService.getUserCategoriesByType(userId, type as TransactionType);
    } else {
      return await UserCategoryService.getUserCategoriesHierarchy(userId);
    }
  } catch (error) {
    console.error('Error fetching template categories:', error);
    throw error;
  }
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
 * Template-based system: No categories created (templates are global and shared across users)
 * This function is now a no-op since all users access the same shared category templates.
 */
export const createDefaultCategoriesForUser = async (userId: string) => {
  try {
    console.log(`ℹ️  User ${userId} will access global category templates (no per-user categories created)`);
    return true;
  } catch (error) {
    console.error(`Error in createDefaultCategoriesForUser for user ${userId}:`, error);
    // Don't throw - we don't want to block user registration
    return false;
  }
};
