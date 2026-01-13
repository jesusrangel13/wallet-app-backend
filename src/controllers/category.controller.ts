import { Request, Response, NextFunction } from 'express';
import * as categoryService from '../services/category.service';

// Legacy category endpoints removed
// Use /api/categories/templates and /api/categories/overrides for the new system

export const getCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
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
