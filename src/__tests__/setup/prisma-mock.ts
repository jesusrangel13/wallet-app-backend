/**
 * Prisma Mock Setup
 * Singleton mock instance to avoid circular dependencies
 */

import { PrismaClient } from '@prisma/client'
import { DeepMockProxy, mockDeep, mockReset } from 'jest-mock-extended'

export type MockPrisma = DeepMockProxy<PrismaClient>

const prismaMock = mockDeep<PrismaClient>() as MockPrisma

export const getPrismaMock = (): MockPrisma => prismaMock

export const resetPrismaMock = (): void => {
  mockReset(prismaMock)
}

// Export for jest.mock usage
export default prismaMock
