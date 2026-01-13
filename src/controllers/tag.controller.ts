import { Request, Response, NextFunction } from 'express';
import * as tagService from '../services/tag.service';
import { createTagSchema, updateTagSchema } from '../utils/validation';

export const createTag = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const validatedData = createTagSchema.parse(req.body);
    const tag = await tagService.createTag(userId, validatedData);

    res.status(201).json({
      success: true,
      data: tag,
      message: 'Tag created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getTags = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;

    // Extract pagination parameters
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const pagination = page || limit ? { page, limit } : undefined;

    const result = await tagService.getTags(userId, pagination);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getTagById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const tag = await tagService.getTagById(userId, id);

    res.status(200).json({
      success: true,
      data: tag,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTag = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const validatedData = updateTagSchema.parse(req.body);
    const tag = await tagService.updateTag(userId, id, validatedData);

    res.status(200).json({
      success: true,
      data: tag,
      message: 'Tag updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTag = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    await tagService.deleteTag(userId, id);

    res.status(200).json({
      success: true,
      message: 'Tag deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
