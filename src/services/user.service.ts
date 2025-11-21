import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

interface UpdateUserData {
  name?: string;
  avatarUrl?: string;
  currency?: string;
  country?: string;
}

interface UpdatePasswordData {
  currentPassword: string;
  newPassword: string;
}

export const getProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      currency: true,
      country: true,
      isVerified: true,
      defaultSharedExpenseAccountId: true,
      defaultSharedExpenseAccount: {
        select: {
          id: true,
          name: true,
          type: true,
          balance: true,
          currency: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

export const updateProfile = async (userId: string, data: UpdateUserData) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      currency: true,
      country: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
};

export const deleteAccount = async (userId: string) => {
  await prisma.user.delete({
    where: { id: userId },
  });

  return { message: 'Account deleted successfully' };
};

export const getUserStats = async (userId: string) => {
  const [accountCount, transactionCount, groupCount] = await Promise.all([
    prisma.account.count({ where: { userId } }),
    prisma.transaction.count({ where: { userId } }),
    prisma.groupMember.count({ where: { userId } }),
  ]);

  return {
    accounts: accountCount,
    transactions: transactionCount,
    groups: groupCount,
  };
};

export const updateDefaultSharedExpenseAccount = async (
  userId: string,
  accountId: string | null
) => {
  // If accountId is provided, verify it belongs to the user
  if (accountId) {
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId,
        isArchived: false,
      },
    });

    if (!account) {
      throw new AppError(
        'Account not found or does not belong to user',
        404
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { defaultSharedExpenseAccountId: accountId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      currency: true,
      country: true,
      isVerified: true,
      defaultSharedExpenseAccountId: true,
      defaultSharedExpenseAccount: {
        select: {
          id: true,
          name: true,
          type: true,
          balance: true,
          currency: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
};
