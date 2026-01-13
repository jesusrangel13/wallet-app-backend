import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { PaginationParams, calculatePagination, calculateSkip, PaginatedResponse } from '../@types/pagination.types';
import { prisma } from '../utils/prisma';

interface CreateTagData {
  name: string;
  color?: string;
}

interface UpdateTagData {
  name?: string;
  color?: string;
}

export const createTag = async (userId: string, data: CreateTagData) => {
  // Check if tag with same name already exists for user
  const existing = await prisma.tag.findFirst({
    where: {
      userId,
      name: data.name,
    },
  });

  if (existing) {
    throw new AppError(ErrorCodes.TAG_ALREADY_EXISTS, 400);
  }

  const tag = await prisma.tag.create({
    data: {
      userId,
      name: data.name,
      color: data.color,
    },
  });

  return tag;
};

export const getTags = async (
  userId: string,
  pagination?: PaginationParams
): Promise<PaginatedResponse<any>> => {
  // Pagination parameters with defaults
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 50, 200); // Default 50, max 200
  const skip = calculateSkip(page, limit);

  // Get total count for pagination metadata
  const total = await prisma.tag.count({ where: { userId } });

  // Get paginated tags
  const tags = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    skip,
    take: limit,
  });

  return {
    data: tags,
    pagination: calculatePagination(page, limit, total),
  };
};

export const getTagById = async (userId: string, id: string) => {
  const tag = await prisma.tag.findFirst({
    where: { id, userId },
  });

  if (!tag) {
    throw new AppError(ErrorCodes.TAG_NOT_FOUND, 404);
  }

  return tag;
};

export const updateTag = async (
  userId: string,
  id: string,
  data: UpdateTagData
) => {
  // Check if tag exists and belongs to user
  const existing = await prisma.tag.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new AppError(ErrorCodes.TAG_NOT_FOUND, 404);
  }

  // If name is being updated, check it doesn't conflict
  if (data.name && data.name !== existing.name) {
    const nameExists = await prisma.tag.findFirst({
      where: {
        userId,
        name: data.name,
        id: { not: id },
      },
    });

    if (nameExists) {
      throw new AppError(ErrorCodes.TAG_ALREADY_EXISTS, 400);
    }
  }

  const tag = await prisma.tag.update({
    where: { id },
    data: {
      name: data.name,
      color: data.color,
    },
  });

  return tag;
};

export const deleteTag = async (userId: string, id: string) => {
  // Check if tag exists and belongs to user
  const existing = await prisma.tag.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    throw new AppError(ErrorCodes.TAG_NOT_FOUND, 404);
  }

  // Delete all transaction-tag relations first
  await prisma.transactionTag.deleteMany({
    where: { tagId: id },
  });

  // Then delete the tag
  await prisma.tag.delete({
    where: { id },
  });

  return { success: true };
};
