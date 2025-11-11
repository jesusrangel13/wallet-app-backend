import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

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
    throw new AppError('Tag with this name already exists', 400);
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

export const getTags = async (userId: string) => {
  const tags = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });

  return tags;
};

export const getTagById = async (userId: string, id: string) => {
  const tag = await prisma.tag.findFirst({
    where: { id, userId },
  });

  if (!tag) {
    throw new AppError('Tag not found', 404);
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
    throw new AppError('Tag not found', 404);
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
      throw new AppError('Tag with this name already exists', 400);
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
    throw new AppError('Tag not found', 404);
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
