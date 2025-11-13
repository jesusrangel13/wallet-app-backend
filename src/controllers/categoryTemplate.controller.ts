/**
 * Category Template Controller
 * Handles all template and override related requests
 * Used when USE_CATEGORY_TEMPLATES feature flag is enabled
 */

import { Request, Response, NextFunction } from 'express';
import { CategoryTemplateService } from '../services/categoryTemplate.service';
import { UserCategoryService } from '../services/userCategory.service';
import { AppError } from '../middleware/errorHandler';
import { TransactionType } from '@prisma/client';

// Extend Express Request to include user ID from auth middleware
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Get all category templates
 * GET /api/categories/templates/all
 */
export const getAllTemplates = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const templates = await CategoryTemplateService.getAllTemplates();
    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all category templates in hierarchical structure
 * GET /api/categories/templates/hierarchy
 */
export const getTemplatesHierarchy = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const templates = await CategoryTemplateService.getAllTemplatesHierarchy();
    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all user's merged categories (templates + overrides)
 * GET /api/categories/overrides/all (implied by user context)
 */
export const getUserCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const categories = await UserCategoryService.getUserCategoriesHierarchy(req.user.userId);
    res.json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create an override for a template category
 * POST /api/categories/overrides
 */
export const createCategoryOverride = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { templateId, name, icon, color } = req.body;

    if (!templateId) {
      throw new AppError('templateId is required', 400);
    }

    if (!name) {
      throw new AppError('name is required', 400);
    }

    const override = await UserCategoryService.overrideTemplateCategory(
      req.user.userId,
      templateId,
      { name, icon, color }
    );

    res.status(201).json({
      success: true,
      data: override,
      message: 'Category override created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific category override
 * GET /api/categories/overrides/:id
 */
export const getCategoryOverride = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;
    const override = await UserCategoryService.getUserCategory(req.user.userId, id);

    res.json({
      success: true,
      data: override,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a category override
 * PUT /api/categories/overrides/:id
 */
export const updateCategoryOverride = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;
    const { name, icon, color } = req.body;

    if (!name && !icon && !color) {
      throw new AppError('At least one field (name, icon, color) is required', 400);
    }

    const updated = await UserCategoryService.updateCustomCategory(
      req.user.userId,
      id,
      { name, icon, color }
    );

    res.json({
      success: true,
      data: updated,
      message: 'Category override updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a category override (or deactivate template)
 * DELETE /api/categories/overrides/:id
 */
export const deleteCategoryOverride = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;

    // Check if this is a template override (deactivate) or custom (delete)
    const category = await UserCategoryService.getUserCategory(req.user.userId, id);

    if (!category) {
      throw new AppError('Category not found', 404);
    }

    if (category.templateId) {
      // It's a template override - deactivate it instead of delete
      await UserCategoryService.toggleCategoryActive(req.user.userId, id, false);
      res.json({
        success: true,
        message: 'Category deactivated successfully',
      });
    } else {
      // It's a custom category - delete it
      await UserCategoryService.deleteCustomCategory(req.user.userId, id);
      res.json({
        success: true,
        message: 'Custom category deleted successfully',
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Create a fully custom category (no template)
 * POST /api/categories/custom
 */
export const createCustomCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { name, icon, color, type } = req.body;

    if (!name) {
      throw new AppError('name is required', 400);
    }

    if (!type || !['EXPENSE', 'INCOME', 'TRANSFER'].includes(type)) {
      throw new AppError('type is required and must be EXPENSE, INCOME, or TRANSFER', 400);
    }

    const customCategory = await UserCategoryService.createCustomCategory(
      req.user.userId,
      { name, icon, color, type: type as TransactionType }
    );

    res.status(201).json({
      success: true,
      data: customCategory,
      message: 'Custom category created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all user's custom categories
 * GET /api/categories/custom/all
 */
export const getUserCustomCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user?.userId) {
      throw new AppError('User not authenticated', 401);
    }

    const customCategories = await UserCategoryService.getUserCategoriesFlat(
      req.user.userId
    );

    const filtered = customCategories.filter((cat) => cat.isCustom);

    res.json({
      success: true,
      data: filtered,
      count: filtered.length,
    });
  } catch (error) {
    next(error);
  }
};
