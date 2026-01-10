import { Request, Response, NextFunction } from 'express';
import * as loanService from '../services/loan.service';
import { LoanStatus } from '@prisma/client';

/**
 * Create a new loan
 * POST /api/loans
 */
export const createLoan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const loan = await loanService.createLoan(userId, req.body);

    res.status(201).json({
      success: true,
      data: loan,
      message: 'Loan created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all loans for the authenticated user with optional filters
 * GET /api/loans?status=ACTIVE&borrowerName=John
 */
export const getUserLoans = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const filters: any = {};

    if (req.query.status) {
      filters.status = req.query.status as LoanStatus;
    }

    if (req.query.borrowerName) {
      filters.borrowerName = req.query.borrowerName as string;
    }

    // Extract pagination parameters
    if (req.query.page) {
      filters.page = Number(req.query.page);
    }
    if (req.query.limit) {
      filters.limit = Number(req.query.limit);
    }

    const result = await loanService.getUserLoans(userId, filters);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single loan by ID
 * GET /api/loans/:id
 */
export const getLoanById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const loan = await loanService.getLoanById(userId, id);

    res.status(200).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record a payment for a loan
 * POST /api/loans/:id/payments
 */
export const recordLoanPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const payment = await loanService.recordLoanPayment(userId, id, req.body);

    res.status(201).json({
      success: true,
      data: payment,
      message: 'Payment recorded successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel (forgive) a loan
 * PATCH /api/loans/:id/cancel
 */
export const cancelLoan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const loan = await loanService.cancelLoan(userId, id);

    res.status(200).json({
      success: true,
      data: loan,
      message: 'Loan cancelled successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a loan (only if no payments have been made)
 * DELETE /api/loans/:id
 */
export const deleteLoan = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const result = await loanService.deleteLoan(userId, id);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Loan deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get loans summary for dashboard widget
 * GET /api/loans/summary
 */
export const getLoansSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const summary = await loanService.getLoansSummary(userId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get loans grouped by borrower
 * GET /api/loans/by-borrower
 */
export const getLoansByBorrower = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.userId;
    const grouped = await loanService.getLoansByBorrower(userId);

    res.status(200).json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    next(error);
  }
};
