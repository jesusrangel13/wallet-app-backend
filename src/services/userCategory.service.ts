import { PrismaClient, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { CategoryTemplateService } from './categoryTemplate.service';

const prisma = new PrismaClient();

export interface MergedCategory {
  id: string; // ID del override o template
  templateId: string | null; // ID del template (null si es custom)
  name: string;
  icon: string | null;
  color: string | null;
  type: TransactionType;
  orderIndex: number;
  isActive: boolean;
  isCustom: boolean;
  isTemplate: boolean; // True si es template sin override
  subcategories?: MergedCategory[];
}

export class UserCategoryService {
  /**
   * Obtiene todas las categorías del usuario (templates + overrides merged)
   * Estructura jerárquica
   */
  static async getUserCategoriesHierarchy(userId: string): Promise<MergedCategory[]> {
    try {
      // Obtener templates
      const templates = await CategoryTemplateService.getAllTemplatesHierarchy();

      // Obtener overrides del usuario
      const overrides = await prisma.userCategoryOverride.findMany({
        where: { userId },
      });

      const overridesByTemplateId = new Map<string, any>();
      overrides.forEach(o => {
        const key = o.templateId || `custom_${o.id}`;
        overridesByTemplateId.set(key, o);
      });

      // Merge templates con overrides
      return templates.map(template =>
        this.mergeTemplate(template, overridesByTemplateId, userId)
      ).filter(cat => {
        // Filtrar categorías inactivas (desactivadas por usuario)
        if (!cat.templateId) return true;
        const override = overridesByTemplateId.get(cat.templateId);
        return override?.isActive !== false;
      });
    } catch (error) {
      console.error(`Error fetching user categories for ${userId}:`, error);
      throw new AppError('Failed to fetch user categories', 500);
    }
  }

  /**
   * Obtiene categorías del usuario por tipo (EXPENSE/INCOME)
   */
  static async getUserCategoriesByType(userId: string, type: TransactionType): Promise<MergedCategory[]> {
    try {
      const allCategories = await this.getUserCategoriesHierarchy(userId);

      return allCategories.filter(cat => cat.type === type);
    } catch (error) {
      console.error(`Error fetching user categories for type ${type}:`, error);
      throw new AppError('Failed to fetch user categories', 500);
    }
  }

  /**
   * Obtiene una categoría específica del usuario
   */
  static async getUserCategory(userId: string, categoryId: string): Promise<MergedCategory | null> {
    try {
      // Primero intentar encontrar como override
      const override = await prisma.userCategoryOverride.findUnique({
        where: {
          id: categoryId,
        },
      });

      if (override && override.userId === userId) {
        if (override.templateId) {
          // Es un override de template
          const template = await CategoryTemplateService.getTemplateById(override.templateId);
          if (!template) return null;

          return {
            id: override.id,
            templateId: override.templateId,
            name: override.name,
            icon: override.icon,
            color: override.color,
            type: template.type,
            orderIndex: template.orderIndex,
            isActive: override.isActive,
            isCustom: false,
            isTemplate: false,
          };
        } else {
          // Es una categoría completamente custom
          return {
            id: override.id,
            templateId: null,
            name: override.name,
            icon: override.icon,
            color: override.color,
            type: 'EXPENSE' as TransactionType, // Default type para custom
            orderIndex: 0,
            isActive: override.isActive,
            isCustom: true,
            isTemplate: false,
          };
        }
      }

      return null;
    } catch (error) {
      console.error(`Error fetching category ${categoryId}:`, error);
      throw new AppError('Failed to fetch category', 500);
    }
  }

  /**
   * Obtiene lista plana de todas las categorías del usuario (sin jerarquía)
   * Útil para selectors y autocomplete
   */
  static async getUserCategoriesFlat(userId: string, type?: TransactionType): Promise<any[]> {
    try {
      const hierarchy = await this.getUserCategoriesHierarchy(userId);

      const flat: any[] = [];

      const flatten = (categories: MergedCategory[], parent: MergedCategory | null = null) => {
        categories.forEach(cat => {
          if (!type || cat.type === type) {
            flat.push({
              ...cat,
              parentId: parent?.id || null,
              parentName: parent?.name || null,
            });

            if (cat.subcategories && cat.subcategories.length > 0) {
              flatten(cat.subcategories, cat);
            }
          }
        });
      };

      flatten(hierarchy);

      return flat;
    } catch (error) {
      console.error(`Error fetching flat categories for ${userId}:`, error);
      throw new AppError('Failed to fetch categories', 500);
    }
  }

  /**
   * Crea una categoría custom completamente nueva (sin template)
   */
  static async createCustomCategory(
    userId: string,
    data: {
      name: string;
      icon?: string;
      color?: string;
      type?: TransactionType;
    }
  ): Promise<any> {
    try {
      // Validar nombre único por usuario
      const existing = await prisma.userCategoryOverride.findFirst({
        where: {
          userId,
          name: data.name,
          isCustom: true,
        },
      });

      if (existing) {
        throw new AppError('Category with this name already exists', 400);
      }

      return await prisma.userCategoryOverride.create({
        data: {
          userId,
          name: data.name,
          icon: data.icon || null,
          color: data.color || null,
          isCustom: true,
          isActive: true,
          templateId: null,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new AppError('Category with this name already exists', 400);
      }
      console.error(`Error creating custom category for ${userId}:`, error);
      throw new AppError('Failed to create category', 500);
    }
  }

  /**
   * Modifica una categoría custom
   */
  static async updateCustomCategory(
    userId: string,
    categoryId: string,
    data: {
      name?: string;
      icon?: string;
      color?: string;
    }
  ): Promise<any> {
    try {
      // Verificar que es custom category y pertenece al usuario
      const category = await prisma.userCategoryOverride.findUnique({
        where: { id: categoryId },
      });

      if (!category || category.userId !== userId) {
        throw new AppError('Category not found', 404);
      }

      if (!category.isCustom) {
        throw new AppError('Can only edit custom categories', 400);
      }

      return await prisma.userCategoryOverride.update({
        where: { id: categoryId },
        data: {
          name: data.name,
          icon: data.icon,
          color: data.color,
        },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error(`Error updating category ${categoryId}:`, error);
      throw new AppError('Failed to update category', 500);
    }
  }

  /**
   * Desactiva/Activa una categoría (por defecto o custom)
   */
  static async toggleCategoryActive(
    userId: string,
    categoryId: string,
    isActive: boolean
  ): Promise<any> {
    try {
      let override = await prisma.userCategoryOverride.findUnique({
        where: { id: categoryId },
      });

      // Si no existe override, crear uno para desactivar el template
      if (!override) {
        throw new AppError('Category not found', 404);
      }

      if (override.userId !== userId) {
        throw new AppError('Unauthorized', 403);
      }

      return await prisma.userCategoryOverride.update({
        where: { id: categoryId },
        data: { isActive },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error(`Error toggling category ${categoryId}:`, error);
      throw new AppError('Failed to update category', 500);
    }
  }

  /**
   * Modifica un override de template (nombre, icon, color)
   */
  static async overrideTemplateCategory(
    userId: string,
    templateId: string,
    data: {
      name?: string;
      icon?: string;
      color?: string;
    }
  ): Promise<any> {
    try {
      // Verificar que el template existe
      const template = await CategoryTemplateService.getTemplateById(templateId);
      if (!template) {
        throw new AppError('Template not found', 404);
      }

      // Buscar o crear override
      let override = await prisma.userCategoryOverride.findFirst({
        where: {
          userId,
          templateId,
        },
      });

      if (!override) {
        // Crear nuevo override
        override = await prisma.userCategoryOverride.create({
          data: {
            userId,
            templateId,
            name: data.name || template.name,
            icon: data.icon !== undefined ? data.icon : template.icon,
            color: data.color !== undefined ? data.color : template.color,
            isActive: true,
            isCustom: false,
          },
        });
      } else {
        // Actualizar override existente
        override = await prisma.userCategoryOverride.update({
          where: { id: override.id },
          data: {
            name: data.name,
            icon: data.icon,
            color: data.color,
          },
        });
      }

      return override;
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error(`Error overriding template ${templateId}:`, error);
      throw new AppError('Failed to override category', 500);
    }
  }

  /**
   * Resets a category override back to template defaults
   */
  static async resetCategoryToDefault(userId: string, categoryId: string): Promise<void> {
    try {
      const override = await prisma.userCategoryOverride.findUnique({
        where: { id: categoryId },
      });

      if (!override || override.userId !== userId || !override.templateId) {
        throw new AppError('Invalid category', 404);
      }

      // Simplemente eliminar el override
      await prisma.userCategoryOverride.delete({
        where: { id: categoryId },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error(`Error resetting category ${categoryId}:`, error);
      throw new AppError('Failed to reset category', 500);
    }
  }

  /**
   * Elimina una categoría custom
   */
  static async deleteCustomCategory(userId: string, categoryId: string): Promise<void> {
    try {
      const category = await prisma.userCategoryOverride.findUnique({
        where: { id: categoryId },
      });

      if (!category || category.userId !== userId) {
        throw new AppError('Category not found', 404);
      }

      if (!category.isCustom) {
        throw new AppError('Can only delete custom categories. Deactivate templates instead.', 400);
      }

      // Verificar que no hay transacciones usando esta categoría
      // (En producción, podrías mantenerlo o usar SetNull)

      await prisma.userCategoryOverride.delete({
        where: { id: categoryId },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      console.error(`Error deleting category ${categoryId}:`, error);
      throw new AppError('Failed to delete category', 500);
    }
  }

  /**
   * Helper para mergear template con override
   */
  private static mergeTemplate(
    template: any,
    overridesByTemplateId: Map<string, any>,
    userId: string
  ): MergedCategory {
    const override = overridesByTemplateId.get(template.id);

    const merged: MergedCategory = {
      id: override?.id || template.id,
      templateId: template.id,
      name: override?.name || template.name,
      icon: override?.icon || template.icon,
      color: override?.color || template.color,
      type: template.type,
      orderIndex: template.orderIndex,
      isActive: override?.isActive !== false,
      isCustom: false,
      isTemplate: !override,
      subcategories: template.subcategories?.map((sub: any) =>
        this.mergeTemplate(sub, overridesByTemplateId, userId)
      ) || [],
    };

    return merged;
  }
}
