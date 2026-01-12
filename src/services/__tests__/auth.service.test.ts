/**
 * Tests for AuthService
 * Tests user registration, login, and profile retrieval
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import { register, login, getProfile } from '../auth.service'
import { prismaMock, mockUser } from '../../__tests__/mocks/prisma'
import { AppError } from '../../middleware/errorHandler'
import { ErrorCodes } from '../../constants/errorCodes'
import * as passwordUtils from '../../utils/password'
import * as jwtUtils from '../../utils/jwt'

// Mock the prisma module
jest.mock('../../utils/prisma', () => ({
  prisma: prismaMock,
}))

// Mock password utilities
jest.mock('../../utils/password')
jest.mock('../../utils/jwt')

const mockedPasswordUtils = passwordUtils as jest.Mocked<typeof passwordUtils>
const mockedJwtUtils = jwtUtils as jest.Mocked<typeof jwtUtils>

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

      // Mock dependencies
      prismaMock.user.findUnique.mockResolvedValue(null) // No existing user
      mockedPasswordUtils.hashPassword.mockResolvedValue(hashedPassword)
      prismaMock.user.create.mockResolvedValue(createdUser)
      mockedJwtUtils.generateToken.mockReturnValue(token)

      const result = await register(registerData)

      // Assertions
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerData.email },
      })
      expect(mockedPasswordUtils.hashPassword).toHaveBeenCalledWith(registerData.password)
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: registerData.email,
          passwordHash: hashedPassword,
          name: registerData.name,
          currency: registerData.currency,
          country: registerData.country,
          language: registerData.language,
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
      })
      expect(mockedJwtUtils.generateToken).toHaveBeenCalledWith(createdUser.id)
      expect(result).toEqual({
        user: createdUser,
        token,
      })
    })

    it('should use default currency and language if not provided', async () => {
      const minimalData = {
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User',
      }
      const hashedPassword = '$2b$10$hashedpassword'
      const token = 'jwt-token-123'

      prismaMock.user.findUnique.mockResolvedValue(null)
      mockedPasswordUtils.hashPassword.mockResolvedValue(hashedPassword)
      prismaMock.user.create.mockResolvedValue(mockUser())
      mockedJwtUtils.generateToken.mockReturnValue(token)

      await register(minimalData)

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: minimalData.email,
          passwordHash: hashedPassword,
          name: minimalData.name,
          currency: 'USD', // Default
          country: undefined,
          language: 'es', // Default
        },
        select: expect.any(Object),
      })
    })

    it('should throw error when user already exists', async () => {
      const existingUser = mockUser({ email: registerData.email })
      prismaMock.user.findUnique.mockResolvedValue(existingUser)

      await expect(register(registerData)).rejects.toThrow(AppError)
      await expect(register(registerData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_USER_EXISTS,
          statusCode: 400,
        })
      )

      // Should not attempt to hash password or create user
      expect(mockedPasswordUtils.hashPassword).not.toHaveBeenCalled()
      expect(prismaMock.user.create).not.toHaveBeenCalled()
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
      mockedPasswordUtils.comparePassword.mockResolvedValue(true)
      mockedJwtUtils.generateToken.mockReturnValue(token)

      const result = await login(loginData)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginData.email },
      })
      expect(mockedPasswordUtils.comparePassword).toHaveBeenCalledWith(
        loginData.password,
        user.passwordHash
      )
      expect(mockedJwtUtils.generateToken).toHaveBeenCalledWith(user.id)
      expect(result).toEqual({
        user: expect.not.objectContaining({ passwordHash: expect.anything() }),
        token,
      })
      expect(result.user).not.toHaveProperty('passwordHash')
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

      expect(mockedPasswordUtils.comparePassword).not.toHaveBeenCalled()
      expect(mockedJwtUtils.generateToken).not.toHaveBeenCalled()
    })

    it('should throw error when password is invalid', async () => {
      const user = mockUser({ email: loginData.email })
      prismaMock.user.findUnique.mockResolvedValue(user)
      mockedPasswordUtils.comparePassword.mockResolvedValue(false)

      await expect(login(loginData)).rejects.toThrow(AppError)
      await expect(login(loginData)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_INVALID_CREDENTIALS,
          statusCode: 401,
        })
      )

      expect(mockedJwtUtils.generateToken).not.toHaveBeenCalled()
    })

    it('should not include passwordHash in response', async () => {
      const user = mockUser()
      const token = 'jwt-token-123'

      prismaMock.user.findUnique.mockResolvedValue(user)
      mockedPasswordUtils.comparePassword.mockResolvedValue(true)
      mockedJwtUtils.generateToken.mockReturnValue(token)

      const result = await login(loginData)

      expect(result.user).not.toHaveProperty('passwordHash')
      expect(Object.keys(result.user)).not.toContain('passwordHash')
    })
  })

  describe('getProfile', () => {
    it('should successfully get user profile', async () => {
      const userId = 'user-123'
      const user = mockUser({ id: userId })
      const { passwordHash, ...userProfile } = user

      prismaMock.user.findUnique.mockResolvedValue(userProfile as any)

      const result = await getProfile(userId)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
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
      })
      expect(result).toEqual(userProfile)
      expect(result).not.toHaveProperty('passwordHash')
    })

    it('should throw error when user not found', async () => {
      const userId = 'non-existent-user'
      prismaMock.user.findUnique.mockResolvedValue(null)

      await expect(getProfile(userId)).rejects.toThrow(AppError)
      await expect(getProfile(userId)).rejects.toThrow(
        expect.objectContaining({
          message: ErrorCodes.AUTH_USER_NOT_FOUND,
          statusCode: 404,
        })
      )
    })
  })
})
