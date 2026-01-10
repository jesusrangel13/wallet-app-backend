import { Request, Response, NextFunction } from 'express';
import * as sharedExpenseService from '../services/sharedExpense.service';
import { createSharedExpenseSchema, updateSharedExpenseSchema, createPaymentSchema } from '../utils/validation';

export const createSharedExpense = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const validatedData = createSharedExpenseSchema.parse(req.body);
    const expense = await sharedExpenseService.createSharedExpense(
      userId,
      validatedData
    );

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Shared expense created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updateSharedExpense = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const validatedData = updateSharedExpenseSchema.parse(req.body);
    const expense = await sharedExpenseService.updateSharedExpense(
      userId,
      id,
      validatedData
    );

    res.status(200).json({
      success: true,
      data: expense,
      message: 'Shared expense updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getSharedExpenses = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const groupId = req.query.groupId as string | undefined;

    // Extract pagination parameters
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const pagination = page || limit ? { page, limit } : undefined;

    const result = await sharedExpenseService.getSharedExpenses(userId, groupId, pagination);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getSharedExpenseById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const expense = await sharedExpenseService.getSharedExpenseById(userId, id);

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteSharedExpense = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const result = await sharedExpenseService.deleteSharedExpense(userId, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const settlePayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const validatedData = createPaymentSchema.parse(req.body);
    const payment = await sharedExpenseService.settlePayment(
      userId,
      validatedData.toUserId,
      validatedData.amount,
      validatedData.groupId
    );

    res.status(201).json({
      success: true,
      data: payment,
      message: 'Payment settled successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getPaymentHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const groupId = req.query.groupId as string | undefined;

    // Extract pagination parameters
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const pagination = page || limit ? { page, limit } : undefined;

    const result = await sharedExpenseService.getPaymentHistory(userId, groupId, pagination);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const calculateSimplifiedDebts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { groupId } = req.params;
    const debts = await sharedExpenseService.calculateSimplifiedDebts(
      userId,
      groupId
    );

    res.status(200).json({
      success: true,
      data: debts,
    });
  } catch (error) {
    next(error);
  }
};

export const markParticipantAsPaid = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id: expenseId, participantUserId } = req.params;
    const { accountId } = req.body;

    const result = await sharedExpenseService.markParticipantAsPaid(
      userId,
      expenseId,
      participantUserId,
      accountId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'Participant marked as paid successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const markParticipantAsUnpaid = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id: expenseId, participantUserId } = req.params;
    const participant = await sharedExpenseService.markParticipantAsUnpaid(
      userId,
      expenseId,
      participantUserId
    );

    res.status(200).json({
      success: true,
      data: participant,
      message: 'Participant marked as unpaid successfully',
    });
  } catch (error) {
    next(error);
  }
};
