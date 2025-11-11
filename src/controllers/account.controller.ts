import { Request, Response, NextFunction } from 'express';
import * as accountService from '../services/account.service';
import { createAccountSchema, updateAccountSchema } from '../utils/validation';

export const createAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const validatedData = createAccountSchema.parse(req.body);
    const account = await accountService.createAccount(userId, validatedData);

    res.status(201).json({
      success: true,
      data: account,
      message: 'Account created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getAccounts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const accounts = await accountService.getAccounts(userId);

    res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
};

export const getAccountById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const account = await accountService.getAccountById(userId, id);

    res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const validatedData = updateAccountSchema.parse(req.body);
    const account = await accountService.updateAccount(userId, id, validatedData);

    res.status(200).json({
      success: true,
      data: account,
      message: 'Account updated successfully',
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
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { transferToAccountId } = req.body;

    const result = await accountService.deleteAccount(userId, id, transferToAccountId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAccountBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const balance = await accountService.getAccountBalance(userId, id);

    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    next(error);
  }
};

export const getTotalBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const balance = await accountService.getTotalBalance(userId);

    res.status(200).json({
      success: true,
      data: balance,
    });
  } catch (error) {
    next(error);
  }
};
