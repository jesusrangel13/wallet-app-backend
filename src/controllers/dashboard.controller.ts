import { Request, Response, NextFunction } from 'express';
import * as dashboardService from '../services/dashboard.service';

export const getCashFlow = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const months = req.query.months ? parseInt(req.query.months as string) : 6;
    const month = req.query.month !== undefined ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year !== undefined ? parseInt(req.query.year as string) : undefined;

    // Calculate endDate from month/year if provided
    let endDate: Date | undefined;
    if (month !== undefined && year !== undefined) {
      // End of the selected month (last day)
      endDate = new Date(year, month + 1, 0);
    }

    const data = await dashboardService.getCashFlow(userId, months, endDate);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getExpensesByCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getExpensesByCategory(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getBalanceHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const month = req.query.month !== undefined ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year !== undefined ? parseInt(req.query.year as string) : undefined;

    // Calculate endDate from month/year if provided
    let endDate: Date | undefined;
    if (month !== undefined && year !== undefined) {
      // End of the selected month (last day)
      endDate = new Date(year, month + 1, 0);
    }

    const data = await dashboardService.getBalanceHistory(userId, days, endDate);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getGroupBalances = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getGroupBalances(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getAccountBalances = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;

    const data = await dashboardService.getAccountBalances(userId);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getDashboardSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getDashboardSummary(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getExpensesByParentCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getExpensesByParentCategory(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPersonalExpenses = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getPersonalExpenses(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getSharedExpensesTotal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getSharedExpensesTotal(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getMonthlySavings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getMonthlySavings(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getExpensesByTag = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();

    const data = await dashboardService.getExpensesByTag(userId, month, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getTopTags = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth();
    const year = req.query.year ? parseInt(req.query.year as string) : now.getFullYear();
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const data = await dashboardService.getTopTags(userId, month, year, limit);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getTagTrend = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const months = req.query.months ? parseInt(req.query.months as string) : 6;
    const tagIds = req.query.tagIds ?
      (Array.isArray(req.query.tagIds) ? req.query.tagIds : [req.query.tagIds]) as string[] :
      undefined;

    const data = await dashboardService.getTagTrend(userId, months, tagIds);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getAnnualSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();

    const data = await dashboardService.getAnnualSummary(userId, year);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
