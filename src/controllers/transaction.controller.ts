import { Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transaction.service';
import {
  createTransactionSchema,
  updateTransactionSchema,
} from '../utils/validation';

export const createTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const validatedData = createTransactionSchema.parse(req.body);
    const transaction = await transactionService.createTransaction(
      userId,
      validatedData
    );

    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Transaction created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;

    // Process tags array safely
    let tags: string[] | undefined;
    if (req.query.tags) {
      if (Array.isArray(req.query.tags)) {
        tags = req.query.tags.map(t => String(t));
      } else {
        tags = [String(req.query.tags)];
      }
    }

    const filters = {
      accountId: req.query.accountId as string,
      type: req.query.type as any,
      categoryId: req.query.categoryId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      minAmount: req.query.minAmount ? Number(req.query.minAmount) : undefined,
      maxAmount: req.query.maxAmount ? Number(req.query.maxAmount) : undefined,
      tags,
      search: req.query.search as string, // Text search
      sortBy: req.query.sortBy as 'date' | 'amount' | 'payee' | undefined, // Sort field
      sortOrder: req.query.sortOrder as 'asc' | 'desc' | undefined, // Sort direction
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    };

    const result = await transactionService.getTransactions(userId, filters);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const transaction = await transactionService.getTransactionById(userId, id);

    res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const validatedData = updateTransactionSchema.parse(req.body);
    const transaction = await transactionService.updateTransaction(
      userId,
      id,
      validatedData
    );

    res.status(200).json({
      success: true,
      data: transaction,
      message: 'Transaction updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const result = await transactionService.deleteTransaction(userId, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionsByCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const data = await transactionService.getTransactionsByCategory(userId);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactionStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();

    const stats = await transactionService.getTransactionStats(userId, month, year);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { transactionIds } = req.body;

    const result = await transactionService.bulkDeleteTransactions(userId, transactionIds);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getRecentTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const limit = req.query.limit ? Number(req.query.limit) : 5;

    const transactions = await transactionService.getRecentTransactions(userId, limit);

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};
