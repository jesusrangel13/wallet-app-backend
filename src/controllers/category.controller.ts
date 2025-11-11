import { Request, Response, NextFunction } from 'express';
import * as categoryService from '../services/category.service';
import { createCategorySchema, updateCategorySchema } from '../utils/validation';

export const createCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const validatedData = createCategorySchema.parse(req.body);
    const category = await categoryService.createCategory(userId, validatedData);

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { type } = req.query;

    const categories = await categoryService.getCategories(userId, type as string | undefined);

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const category = await categoryService.getCategoryById(userId, id);

    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const validatedData = updateCategorySchema.parse(req.body);
    const category = await categoryService.updateCategory(userId, id, validatedData);

    res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    await categoryService.deleteCategory(userId, id);

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
