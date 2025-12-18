import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

const prisma = new PrismaClient();

interface RegisterData {
  email: string;
  password: string;
  name: string;
  currency?: string;
  country?: string;
  language?: string;
}

interface LoginData {
  email: string;
  password: string;
}

export const register = async (data: RegisterData) => {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new AppError(ErrorCodes.AUTH_USER_EXISTS, 400);
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      currency: data.currency || 'USD',
      country: data.country,
      language: data.language || 'es',
    },
    select: {
      id: true,
      email: true,
      name: true,
      currency: true,
      country: true,
      language: true,
      createdAt: true,
    },
  });

  // Note: Categories are now template-based and shared globally
  // Users automatically have access to all category templates

  // Generate token
  const token = generateToken(user.id);

  return { user, token };
};

export const login = async (data: LoginData) => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401);
  }

  // Verify password
  const isValidPassword = await comparePassword(data.password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 401);
  }

  // Generate token
  const token = generateToken(user.id);

  // Return user without password
  const { passwordHash, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token };
};

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
      language: true,
      isVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND, 404);
  }

  return user;
};
