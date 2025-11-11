import { Request, Response, NextFunction } from 'express';
import * as tagService from '../services/tag.service';
import { createTagSchema, updateTagSchema } from '../utils/validation';

export const createTag = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user.userId;
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
    const userId = (req as any).user.userId;
    const tags = await tagService.getTags(userId);

    res.status(200).json({
      success: true,
      data: tags,
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
    const userId = (req as any).user.userId;
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
    const userId = (req as any).user.userId;
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
    const userId = (req as any).user.userId;
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
