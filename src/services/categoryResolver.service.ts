/**
 * Category Resolver Service
 * Resolves category IDs to category information from either
 * UserCategoryOverride or CategoryTemplate tables
 *
 * This service replaces the legacy Category model's Prisma relations
 */

import { prisma } from '../utils/prisma';

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: string;
  parent?: CategoryInfo | null;
}

/**
 * Resolve a single category ID to its information
 * Checks UserCategoryOverride first, then CategoryTemplate
 */
export const resolveCategoryById = async (
  categoryId: string | null,
  userId?: string
): Promise<CategoryInfo | null> => {
  if (!categoryId) return null;

  // Try UserCategoryOverride first (user-specific customizations)
  if (userId) {
    const override = await prisma.userCategoryOverride.findFirst({
      where: {
        id: categoryId,
        userId,
        isActive: true,
      },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
            type: true,
          },
        },
      },
    });

    if (override) {
      return {
        id: override.id,
        name: override.name,
        icon: override.icon,
        color: override.color,
        type: override.type,
        parent: override.parent
          ? {
              id: override.parent.id,
              name: override.parent.name,
              icon: override.parent.icon,
              color: override.parent.color,
              type: override.parent.type,
            }
          : null,
      };
    }
  }

  // Try CategoryTemplate (shared templates)
  const template = await prisma.categoryTemplate.findUnique({
    where: { id: categoryId },
    include: {
      parent: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          type: true,
        },
      },
    },
  });

  if (template) {
    return {
      id: template.id,
      name: template.name,
      icon: template.icon,
      color: template.color,
      type: template.type,
      parent: template.parent
        ? {
            id: template.parent.id,
            name: template.parent.name,
            icon: template.parent.icon,
            color: template.parent.color,
            type: template.parent.type,
          }
        : null,
    };
  }

  // Fallback: check UserCategoryOverride without userId filter (for shared expenses)
  const anyOverride = await prisma.userCategoryOverride.findFirst({
    where: {
      id: categoryId,
      isActive: true,
    },
    include: {
      parent: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          type: true,
        },
      },
    },
  });

  if (anyOverride) {
    return {
      id: anyOverride.id,
      name: anyOverride.name,
      icon: anyOverride.icon,
      color: anyOverride.color,
      type: anyOverride.type,
      parent: anyOverride.parent
        ? {
            id: anyOverride.parent.id,
            name: anyOverride.parent.name,
            icon: anyOverride.parent.icon,
            color: anyOverride.parent.color,
            type: anyOverride.parent.type,
          }
        : null,
    };
  }

  return null;
};

/**
 * Resolve multiple category IDs at once (batch operation for performance)
 * Returns a map of categoryId -> CategoryInfo
 */
export const resolveCategoriesBatch = async (
  categoryIds: (string | null)[],
  userId?: string
): Promise<Map<string, CategoryInfo>> => {
  const result = new Map<string, CategoryInfo>();
  const uniqueIds = [...new Set(categoryIds.filter((id): id is string => id !== null))];

  if (uniqueIds.length === 0) return result;

  // Batch fetch from UserCategoryOverride
  const overridesQuery: any = {
    id: { in: uniqueIds },
    isActive: true,
  };

  if (userId) {
    overridesQuery.userId = userId;
  }

  const overrides = await prisma.userCategoryOverride.findMany({
    where: overridesQuery,
    include: {
      parent: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          type: true,
        },
      },
      template: {
        select: {
          id: true,
          name: true,
          icon: true,
          color: true,
          type: true,
          parent: {
            select: {
              id: true,
              name: true,
              icon: true,
              color: true,
              type: true,
            },
          },
        },
      },
    },
  });

  overrides.forEach((override) => {
    // Use template values as fallback for null override fields
    const icon = override.icon !== null ? override.icon : (override.template?.icon || null);
    const color = override.color !== null ? override.color : (override.template?.color || null);

    // If override has a custom parent, use it; otherwise use template's parent
    const parentInfo = override.parent || (override.template?.parent ? {
      id: override.template.parent.id,
      name: override.template.parent.name,
      icon: override.template.parent.icon,
      color: override.template.parent.color,
      type: override.template.parent.type,
    } : null);

    result.set(override.id, {
      id: override.id,
      name: override.name,
      icon: icon,
      color: color,
      type: override.type,
      parent: parentInfo,
    });
  });

  // Find IDs not resolved by overrides
  const unresolvedIds = uniqueIds.filter((id) => !result.has(id));

  if (unresolvedIds.length > 0) {
    // Batch fetch from CategoryTemplate
    const templates = await prisma.categoryTemplate.findMany({
      where: { id: { in: unresolvedIds } },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
            type: true,
          },
        },
      },
    });

    templates.forEach((template) => {
      result.set(template.id, {
        id: template.id,
        name: template.name,
        icon: template.icon,
        color: template.color,
        type: template.type,
        parent: template.parent
          ? {
              id: template.parent.id,
              name: template.parent.name,
              icon: template.parent.icon,
              color: template.parent.color,
              type: template.parent.type,
            }
          : null,
      });
    });
  }

  return result;
};

/**
 * Validate that a category ID is valid for a given user
 * Returns true if the category exists in UserCategoryOverride or CategoryTemplate
 */
export const validateCategoryId = async (
  categoryId: string,
  userId: string
): Promise<boolean> => {
  // Check UserCategoryOverride
  const override = await prisma.userCategoryOverride.findFirst({
    where: {
      id: categoryId,
      userId,
      isActive: true,
    },
  });

  if (override) return true;

  // Check CategoryTemplate
  const template = await prisma.categoryTemplate.findUnique({
    where: { id: categoryId },
  });

  return !!template;
};

/**
 * Get category names for search/filtering
 * Returns category IDs that match the search term
 */
export const searchCategoriesByName = async (
  searchTerm: string,
  userId: string
): Promise<string[]> => {
  const categoryIds: string[] = [];

  // Search in UserCategoryOverride
  const overrides = await prisma.userCategoryOverride.findMany({
    where: {
      userId,
      isActive: true,
      name: { contains: searchTerm, mode: 'insensitive' },
    },
    select: { id: true },
  });

  categoryIds.push(...overrides.map((o) => o.id));

  // Search in CategoryTemplate
  const templates = await prisma.categoryTemplate.findMany({
    where: {
      name: { contains: searchTerm, mode: 'insensitive' },
    },
    select: { id: true },
  });

  categoryIds.push(...templates.map((t) => t.id));

  return [...new Set(categoryIds)];
};

/**
 * Enhance transactions with resolved category information
 * Useful for bulk operations where you need to add category data to transactions
 */
export const enhanceTransactionsWithCategories = async <
  T extends { categoryId: string | null; userId: string }
>(
  transactions: T[]
): Promise<(T & { category: CategoryInfo | null })[]> => {
  // Extract unique category IDs
  const categoryIds = transactions.map((t) => t.categoryId);

  // Group by userId for proper resolution
  const userIdMap = new Map<string, string[]>();
  transactions.forEach((t) => {
    if (t.categoryId) {
      const existing = userIdMap.get(t.userId) || [];
      existing.push(t.categoryId);
      userIdMap.set(t.userId, existing);
    }
  });

  // Resolve all categories (batch for efficiency)
  const categoryMap = await resolveCategoriesBatch(categoryIds);

  // Enhance transactions
  return transactions.map((t) => ({
    ...t,
    category: t.categoryId ? categoryMap.get(t.categoryId) || null : null,
  }));
};
