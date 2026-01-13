/**
 * Tests for AuthService
 * Tests user registration, login, and profile retrieval
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { DeepMockProxy, mockDeep } from 'jest-mock-extended'

// Create mocks BEFORE any imports
const prismaMock = mockDeep<PrismaClient>()
const passwordUtilsMock = {
  hashPassword: jest.fn<() => Promise<string>>(),
  comparePassword: jest.fn<() => Promise<boolean>>(),
}
const jwtUtilsMock = {
  generateToken: jest.fn<() => string>(),
  verifyToken: jest.fn(),
}

// Mock modules BEFORE importing the service
jest.mock('../../utils/prisma', () => ({
  prisma: prismaMock,
}))
jest.mock('../../utils/password', () => passwordUtilsMock)
jest.mock('../../utils/jwt', () => jwtUtilsMock)

// NOW import the service and other dependencies
import { register, login, getProfile } from '../auth.service'
import { mockUser } from '../../__tests__/mocks/prisma'
import { AppError } from '../../middleware/errorHandler'
import { ErrorCodes } from '../../constants/errorCodes'

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('register', () => {
    const registerData = {
      email: 'newuser@example.com',
      password: 'SecurePass123!',
      name: 'New User',
      currency: 'USD',
      country: 'US',
      language: 'en',
    }

    it('should successfully register a new user', async () => {
      const hashedPassword = '$2b$10$hashedpassword'
      const token = 'jwt-token-123'
      const createdUser = mockUser({
        id: 'new-user-123',
        email: registerData.email,
        name: registerData.name,
        currency: registerData.currency,
      })

      prismaMock.user.findUnique.mockResolvedValue(null)
      passwordUtilsMock.hashPassword.mockResolvedValue(hashedPassword)
      prismaMock.user.create.mockResolvedValue(createdUser)
      jwtUtilsMock.generateToken.mockReturnValue(token)

      const result = await register(registerData)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerData.email },
      })
      expect(passwordUtilsMock.hashPassword).toHaveBeenCalledWith(registerData.password)
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: registerData.email,
          name: registerData.name,
          passwordHash: hashedPassword,
          currency: registerData.currency,
          country: registerData.country,
          language: registerData.language,
        },
        select: expect.any(Object),
      })
      expect(jwtUtilsMock.generateToken).toHaveBeenCalledWith(createdUser.id)
      expect(result).toEqual({
        user: createdUser,
        token,
      })
    })

    it('should throw error when email already exists', async () => {
      const existingUser = mockUser({ email: registerData.email })

      prismaMock.user.findUnique.mockResolvedValue(existingUser)

      await expect(register(registerData)).rejects.toThrow(AppError)
      await expect(register(registerData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_USER_EXISTS,
          statusCode: 400,
        })
      )

      expect(prismaMock.user.create).not.toHaveBeenCalled()
    })

    it('should use default values for optional fields', async () => {
      const minimalData = {
        email: 'minimal@example.com',
        password: 'SecurePass123!',
        name: 'Minimal User',
      }

      prismaMock.user.findUnique.mockResolvedValue(null)
      passwordUtilsMock.hashPassword.mockResolvedValue('$2b$10$hashedpassword')
      prismaMock.user.create.mockResolvedValue(
        mockUser({ email: minimalData.email })
      )
      jwtUtilsMock.generateToken.mockReturnValue('token-123')

      await register(minimalData)

      const createCall = prismaMock.user.create.mock.calls[0][0]
      expect(createCall.data).toMatchObject({
        email: minimalData.email,
        name: minimalData.name,
        passwordHash: expect.any(String),
      })
      expect(createCall.data.currency).toBe('USD') // Default
    })
  })

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'SecurePass123!',
    }

    it('should successfully login with valid credentials', async () => {
      const user = mockUser({ email: loginData.email })
      const token = 'jwt-token-123'

      prismaMock.user.findUnique.mockResolvedValue(user)
      passwordUtilsMock.comparePassword.mockResolvedValue(true)
      jwtUtilsMock.generateToken.mockReturnValue(token)

      const result = await login(loginData)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      })
      expect(passwordUtilsMock.comparePassword).toHaveBeenCalledWith(
        loginData.password,
        user.passwordHash
      )
      expect(jwtUtilsMock.generateToken).toHaveBeenCalledWith(user.id)

      // The result should have user without passwordHash
      expect(result.user).not.toHaveProperty('passwordHash')
      expect(result.token).toBe(token)
    })

    it('should throw error when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)

      await expect(login(loginData)).rejects.toThrow(AppError)
      await expect(login(loginData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_INVALID_CREDENTIALS,
          statusCode: 401,
        })
      )

      expect(passwordUtilsMock.comparePassword).not.toHaveBeenCalled()
    })

    it('should throw error when password is incorrect', async () => {
      const user = mockUser({ email: loginData.email })

      prismaMock.user.findUnique.mockResolvedValue(user)
      passwordUtilsMock.comparePassword.mockResolvedValue(false)

      await expect(login(loginData)).rejects.toThrow(AppError)
      await expect(login(loginData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_INVALID_CREDENTIALS,
          statusCode: 401,
        })
      )

      expect(jwtUtilsMock.generateToken).not.toHaveBeenCalled()
    })
  })

  describe('getProfile', () => {
    it('should successfully get user profile', async () => {
      const userId = 'user-123'
      const user = mockUser({ id: userId })

      prismaMock.user.findUnique.mockResolvedValue(user)

      const result = await getProfile(userId)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          currency: true,
          country: true,
          language: true,
          isVerified: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      })
      expect(result).toEqual(user)
    })

    it('should throw error when user not found', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)

      await expect(getProfile('non-existent')).rejects.toThrow(AppError)
      await expect(getProfile('non-existent')).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_USER_NOT_FOUND,
          statusCode: 404,
        })
      )
    })
  })
})
