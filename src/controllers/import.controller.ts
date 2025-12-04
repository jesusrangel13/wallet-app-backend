import { Request, Response, NextFunction } from 'express';
import * as importService from '../services/import.service';

export const importTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { accountId, fileName, fileType, transactions } = req.body;

    // Start import process (this will create the import history and process transactions)
    const result = await importService.importTransactions(
      userId,
      accountId,
      fileName,
      fileType,
      transactions
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getImportHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;

    // Extract pagination parameters
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const pagination = page || limit ? { page, limit } : undefined;

    const result = await importService.getImportHistory(userId, pagination);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getImportHistoryById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const importHistory = await importService.getImportHistoryById(userId, id);

    res.status(200).json({
      success: true,
      data: importHistory,
    });
  } catch (error) {
    next(error);
  }
};
