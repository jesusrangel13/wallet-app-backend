import { Request, Response, NextFunction } from 'express';
import * as budgetService from '../services/budget.service';
import { createBudgetSchema } from '../utils/validation';

export const createBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const validatedData = createBudgetSchema.parse(req.body);
    const budget = await budgetService.createBudget(userId, validatedData);

    res.status(201).json({
      success: true,
      data: budget,
      message: 'Budget created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getBudgets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const year = req.query.year ? Number(req.query.year) : undefined;
    const budgets = await budgetService.getBudgets(userId, year);

    res.status(200).json({
      success: true,
      data: budgets,
    });
  } catch (error) {
    next(error);
  }
};

export const getBudgetById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const budget = await budgetService.getBudgetById(userId, id);

    res.status(200).json({
      success: true,
      data: budget,
    });
  } catch (error) {
    next(error);
  }
};

export const updateBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { amount } = req.body;
    const budget = await budgetService.updateBudget(userId, id, amount);

    res.status(200).json({
      success: true,
      data: budget,
      message: 'Budget updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const result = await budgetService.deleteBudget(userId, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getBudgetVsActual = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required',
      });
    }

    const data = await budgetService.getBudgetVsActual(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentMonthBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const data = await budgetService.getCurrentMonthBudget(userId);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
