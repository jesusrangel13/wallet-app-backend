import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';

/**
 * Expense Split Calculator Service
 *
 * Extracted from sharedExpense.service.ts as part of OPT-11 refactoring.
 * Handles all split calculation logic for shared expenses.
 *
 * This is a pure logic service with no database dependencies,
 * making it easy to test and reuse.
 *
 * Responsibilities:
 * - Calculate split amounts based on different split types (EQUAL, PERCENTAGE, EXACT, SHARES)
 * - Validate split configurations
 * - Ensure amounts add up correctly
 */

export interface ParticipantSplitInput {
  userId: string;
  amountOwed?: number;
  percentage?: number;
  shares?: number;
}

export interface ParticipantWithAmount {
  userId: string;
  amountOwed: number;
}

export type SplitType = 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'SHARES';

/**
 * Calculate equal split among participants
 *
 * @param totalAmount - Total amount to split
 * @param participants - List of participants
 * @returns Participants with calculated amounts
 */
export function calculateEqualSplit(
  totalAmount: number,
  participants: ParticipantSplitInput[]
): ParticipantWithAmount[] {
  const amountPerPerson = totalAmount / participants.length;
  return participants.map((p) => ({
    userId: p.userId,
    amountOwed: amountPerPerson,
  }));
}

/**
 * Calculate percentage-based split among participants
 *
 * @param totalAmount - Total amount to split
 * @param participants - List of participants with percentage values
 * @returns Participants with calculated amounts
 * @throws AppError if percentages don't sum to 100
 */
export function calculatePercentageSplit(
  totalAmount: number,
  participants: ParticipantSplitInput[]
): ParticipantWithAmount[] {
  const totalPercentage = participants.reduce(
    (sum, p) => sum + (p.percentage || 0),
    0
  );

  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_PERCENTAGE_INVALID, 400);
  }

  return participants.map((p) => ({
    userId: p.userId,
    amountOwed: (totalAmount * (p.percentage || 0)) / 100,
  }));
}

/**
 * Calculate exact amount split among participants
 *
 * @param totalAmount - Total amount (must match sum of exact amounts)
 * @param participants - List of participants with exact amounts
 * @returns Participants with their specified amounts
 * @throws AppError if exact amounts don't sum to total amount
 */
export function calculateExactSplit(
  totalAmount: number,
  participants: ParticipantSplitInput[]
): ParticipantWithAmount[] {
  const sumOfAmounts = participants.reduce(
    (sum, p) => sum + (p.amountOwed || 0),
    0
  );

  if (Math.abs(sumOfAmounts - totalAmount) > 0.01) {
    throw new AppError(ErrorCodes.SHARED_EXPENSE_EXACT_AMOUNT_INVALID, 400);
  }

  return participants.map((p) => ({
    userId: p.userId,
    amountOwed: p.amountOwed || 0,
  }));
}

/**
 * Calculate shares-based split among participants
 *
 * @param totalAmount - Total amount to split
 * @param participants - List of participants with share values (defaults to 1 if not specified)
 * @returns Participants with calculated amounts
 */
export function calculateSharesSplit(
  totalAmount: number,
  participants: ParticipantSplitInput[]
): ParticipantWithAmount[] {
  const totalShares = participants.reduce(
    (sum, p) => sum + (p.shares || 1),
    0
  );

  return participants.map((p) => ({
    userId: p.userId,
    amountOwed: (totalAmount * (p.shares || 1)) / totalShares,
  }));
}

/**
 * Calculate split amounts based on split type
 *
 * Main entry point for all split calculations. Delegates to specific
 * calculation functions based on split type.
 *
 * @param totalAmount - Total amount to split
 * @param splitType - Type of split (EQUAL, PERCENTAGE, EXACT, SHARES)
 * @param participants - List of participants with relevant data
 * @returns Participants with calculated amounts
 * @throws AppError if split configuration is invalid
 */
export function calculateSplit(
  totalAmount: number,
  splitType: SplitType,
  participants: ParticipantSplitInput[]
): ParticipantWithAmount[] {
  if (!participants || participants.length === 0) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 400);
  }

  switch (splitType) {
    case 'EQUAL':
      return calculateEqualSplit(totalAmount, participants);
    case 'PERCENTAGE':
      return calculatePercentageSplit(totalAmount, participants);
    case 'EXACT':
      return calculateExactSplit(totalAmount, participants);
    case 'SHARES':
      return calculateSharesSplit(totalAmount, participants);
    default:
      throw new AppError(ErrorCodes.BAD_REQUEST, 400);
  }
}

/**
 * Validate split configuration without calculating
 *
 * Useful for validating user input before creating/updating an expense.
 *
 * @param totalAmount - Total amount to split
 * @param splitType - Type of split
 * @param participants - List of participants with relevant data
 * @returns true if valid
 * @throws AppError if invalid
 */
export function validateSplitConfiguration(
  totalAmount: number,
  splitType: SplitType,
  participants: ParticipantSplitInput[]
): boolean {
  // This will throw if invalid, return true if valid
  calculateSplit(totalAmount, splitType, participants);
  return true;
}
