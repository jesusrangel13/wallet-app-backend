import { TransactionType } from '@prisma/client';
import { UserCategoryService } from './userCategory.service';
import logger from '../utils/logger';

// Template-based category system - all legacy Category functions removed

/**
 * Get categories using the template-based system
 * Returns merged categories from templates and user overrides
 */
export const getCategories = async (userId: string, type?: string) => {
  try {
    if (type) {
      return await UserCategoryService.getUserCategoriesByType(userId, type as TransactionType);
    } else {
      return await UserCategoryService.getUserCategoriesHierarchy(userId);
    }
  } catch (error) {
    logger.error('Error fetching template categories:', error);
    throw error;
  }
};
