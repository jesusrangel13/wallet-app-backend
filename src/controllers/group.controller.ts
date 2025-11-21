import { Request, Response, NextFunction } from 'express';
import * as groupService from '../services/group.service';
import * as sharedExpenseService from '../services/sharedExpense.service';
import { createGroupSchema, updateGroupSchema } from '../utils/validation';

export const createGroup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const validatedData = createGroupSchema.parse(req.body);
    const group = await groupService.createGroup(userId, validatedData);

    res.status(201).json({
      success: true,
      data: group,
      message: 'Group created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getGroups = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const groups = await groupService.getGroups(userId);

    res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
};

export const getGroupById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const group = await groupService.getGroupById(userId, id);

    res.status(200).json({
      success: true,
      data: group,
    });
  } catch (error) {
    next(error);
  }
};

export const updateGroup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const validatedData = updateGroupSchema.parse(req.body);
    const group = await groupService.updateGroup(userId, id, validatedData);

    res.status(200).json({
      success: true,
      data: group,
      message: 'Group updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const result = await groupService.deleteGroup(userId, id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const addMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const result = await groupService.addMember(userId, id, email);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id, memberId } = req.params;
    const result = await groupService.removeMember(userId, id, memberId);

    res.status(200).json({
      success: true,
      data: result,
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
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const balances = await groupService.getGroupBalances(userId, id);

    res.status(200).json({
      success: true,
      data: balances,
    });
  } catch (error) {
    next(error);
  }
};

export const updateDefaultSplit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { defaultSplitType, memberSplits } = req.body;

    if (!defaultSplitType) {
      return res.status(400).json({
        success: false,
        message: 'Default split type is required',
      });
    }

    const result = await groupService.updateDefaultSplit(userId, id, {
      defaultSplitType,
      memberSplits: memberSplits || [],
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Default split configuration updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const settleAllBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
    const { id: groupId } = req.params;
    const { otherUserId, accountId } = req.body;

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'Other user ID is required',
      });
    }

    const result = await sharedExpenseService.settleAllBalance(
      userId,
      groupId,
      otherUserId,
      accountId
    );

    res.status(200).json({
      success: true,
      data: result,
      message: 'All balances settled successfully',
    });
  } catch (error) {
    next(error);
  }
};
