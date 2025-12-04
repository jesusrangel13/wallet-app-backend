/**
 * Pagination parameters for API requests
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

/**
 * Pagination metadata for API responses
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Generic paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Helper function to calculate pagination values
 */
export const calculatePagination = (
  page: number = 1,
  limit: number = 50,
  total: number
): PaginationMeta => {
  const safePage = Math.max(page, 1);
  const totalPages = Math.ceil(total / limit);

  return {
    page: safePage,
    limit,
    total,
    totalPages,
    hasMore: safePage < totalPages,
  };
};

/**
 * Helper function to calculate skip value for Prisma queries
 */
export const calculateSkip = (page: number, limit: number): number => {
  return (Math.max(page, 1) - 1) * limit;
};
