import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service';
import * as sharedExpenseService from '../services/sharedExpense.service';

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const user = await userService.getProfile(userId);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const user = await userService.updateProfile(userId, req.body);

    res.status(200).json({
      success: true,
      data: user,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const result = await userService.deleteAccount(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const stats = await userService.getUserStats(userId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyBalances = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;

    const balances = await sharedExpenseService.getUserBalances(userId, month, year);

    res.status(200).json({
      success: true,
      data: balances,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDefaultSharedExpenseAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { accountId } = req.body;

    const user = await userService.updateDefaultSharedExpenseAccount(
      userId,
      accountId
    );

    res.status(200).json({
      success: true,
      data: user,
      message: 'Default shared expense account updated successfully',
    });
  } catch (error) {
    next(error);
  }
};
