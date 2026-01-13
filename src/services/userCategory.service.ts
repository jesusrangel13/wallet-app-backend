import { TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { CategoryTemplateService } from './categoryTemplate.service';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

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

      // Obtener overrides y custom categories con subcategorías
      const overrides = await prisma.userCategoryOverride.findMany({
        where: { userId },
        include: {
          subcategories: true,
        },
      });

      const overridesByTemplateId = new Map<string, any>();
      const customCategoriesById = new Map<string, any>();

      overrides.forEach(o => {
        const key = o.templateId || `custom_${o.id}`;
        overridesByTemplateId.set(key, o);

        // Si es custom y no tiene parent, almacenarla para procesamiento posterior
        if (o.templateId === null && o.isCustom && !o.parentOverrideId) {
          customCategoriesById.set(o.id, o);
        }
      });

      // Merge templates con overrides
      const mergedTemplates = templates.map(template =>
        this.mergeTemplate(template, overridesByTemplateId, userId, overrides)
      ).filter(cat => {
        // Filtrar categorías inactivas (desactivadas por usuario)
        if (!cat.templateId) return true;
        const override = overridesByTemplateId.get(cat.templateId);
        return override?.isActive !== false;
      });

      // Agregar categorías custom standalone (sin template, sin parent)
      // Incluye tanto isCustom:true como isCustom:false (categorías override sin template)
      const customCategories = overrides
        .filter(o => o.templateId === null && !o.parentOverrideId && o.isActive)
        .map(custom => this.mergeCustomCategory(custom, overrides));

      return [...mergedTemplates, ...customCategories];
    } catch (error) {
      logger.error(`Error fetching user categories for ${userId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
      logger.error(`Error fetching user categories for type ${type}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
            type: override.type || ('EXPENSE' as TransactionType),
            orderIndex: 0,
            isActive: override.isActive,
            isCustom: true,
            isTemplate: false,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error fetching category ${categoryId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
      logger.error(`Error fetching flat categories for ${userId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Crea una categoría custom completamente nueva (sin template)
   * Puede ser subcategoría de otra custom si se proporciona parentId
   */
  static async createCustomCategory(
    userId: string,
    data: {
      name: string;
      icon?: string;
      color?: string;
      type?: TransactionType;
      parentId?: string; // Para subcategorías
    }
  ): Promise<any> {
    try {
      // Si tiene parentId, delegar al método específico de subcategorías
      if (data.parentId) {
        return await this.createCustomSubcategory(userId, data.parentId, {
          name: data.name,
          icon: data.icon,
          color: data.color,
          type: data.type,
        });
      }

      // Validar nombre único por usuario (solo para categorías de nivel superior)
      const existing = await prisma.userCategoryOverride.findFirst({
        where: {
          userId,
          name: data.name,
          isCustom: true,
          parentOverrideId: null,
        },
      });

      if (existing) {
        throw new AppError(ErrorCodes.CATEGORY_ALREADY_EXISTS, 400);
      }

      return await prisma.userCategoryOverride.create({
        data: {
          userId,
          name: data.name,
          icon: data.icon || null,
          color: data.color || null,
          type: data.type || 'EXPENSE',
          isCustom: true,
          isActive: true,
          templateId: null,
        },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      if (error.code === 'P2002') {
        throw new AppError(ErrorCodes.CATEGORY_ALREADY_EXISTS, 400);
      }
      logger.error(`Error creating custom category for ${userId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
        throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
      }

      if (!category.isCustom) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400);
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
      logger.error(`Error updating category ${categoryId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
        throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
      }

      if (override.userId !== userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 403);
      }

      return await prisma.userCategoryOverride.update({
        where: { id: categoryId },
        data: { isActive },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(`Error toggling category ${categoryId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
        throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
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
            type: template.type,
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
      logger.error(`Error overriding template ${templateId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
        throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
      }

      // Simplemente eliminar el override
      await prisma.userCategoryOverride.delete({
        where: { id: categoryId },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(`Error resetting category ${categoryId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
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
        throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
      }

      if (!category.isCustom) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400);
      }

      // Verificar que no hay transacciones usando esta categoría
      // (En producción, podrías mantenerlo o usar SetNull)

      await prisma.userCategoryOverride.delete({
        where: { id: categoryId },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(`Error deleting category ${categoryId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Crea una subcategoría custom dentro de una categoría (template o custom)
   * Option B: Soporta crear subcategorías bajo templates automáticamente creando un override
   */
  static async createCustomSubcategory(
    userId: string,
    parentId: string,
    data: {
      name: string;
      icon?: string;
      color?: string;
      type?: TransactionType;
    }
  ): Promise<any> {
    try {
      let parentOverride: any = null;
      let parentType: TransactionType = 'EXPENSE';

      // Paso 1: Buscar la categoría padre en UserCategoryOverride (custom parent)
      const customParent = await prisma.userCategoryOverride.findUnique({
        where: { id: parentId },
      });

      if (customParent) {
        // Es una categoría custom del usuario
        if (customParent.userId !== userId) {
          throw new AppError(ErrorCodes.UNAUTHORIZED, 403);
        }
        parentOverride = customParent;
        parentType = customParent.type || ('EXPENSE' as TransactionType);
      } else {
        // Paso 2: Si no existe en overrides, buscar en CategoryTemplate
        const templateParent = await CategoryTemplateService.getTemplateById(parentId);

        if (!templateParent) {
          throw new AppError(ErrorCodes.CATEGORY_NOT_FOUND, 404);
        }

        // Es un template - crear un override automáticamente para usarlo como padre
        parentType = templateParent.type;

        // Verificar si ya existe un override para este template del usuario
        const existingOverride = await prisma.userCategoryOverride.findFirst({
          where: {
            userId,
            templateId: parentId,
          },
        });

        if (existingOverride) {
          parentOverride = existingOverride;
        } else {
          // Crear un nuevo override del template
          parentOverride = await prisma.userCategoryOverride.create({
            data: {
              userId,
              templateId: parentId,
              name: templateParent.name,
              icon: templateParent.icon,
              color: templateParent.color,
              type: templateParent.type,
              isActive: true,
              isCustom: false,
            },
          });
        }
      }

      // Validar que la subcategoría sea del mismo tipo
      const childType = data.type || parentType;

      if (childType !== parentType) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400);
      }

      // Validar nombre único dentro del parent
      const existing = await prisma.userCategoryOverride.findFirst({
        where: {
          userId,
          name: data.name,
          parentOverrideId: parentOverride.id,
        },
      });

      if (existing) {
        throw new AppError(ErrorCodes.CATEGORY_ALREADY_EXISTS, 400);
      }

      return await prisma.userCategoryOverride.create({
        data: {
          userId,
          parentOverrideId: parentOverride.id,
          name: data.name,
          icon: data.icon || null,
          color: data.color || null,
          type: childType,
          isCustom: true,
          isActive: true,
          templateId: null,
        },
      });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error(`Error creating custom subcategory for ${userId}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Helper para convertir una categoría custom a MergedCategory incluyendo subcategorías
   */
  private static mergeCustomCategory(
    custom: any,
    allOverrides: any[]
  ): MergedCategory {
    // Obtener subcategorías de esta categoría custom
    const subcategories = allOverrides
      .filter(o => o.parentOverrideId === custom.id && o.isActive)
      .map(sub => this.mergeCustomCategory(sub, allOverrides));

    return {
      id: custom.id,
      templateId: null,
      name: custom.name,
      icon: custom.icon,
      color: custom.color,
      type: custom.type || ('EXPENSE' as TransactionType),
      orderIndex: 0,
      isActive: custom.isActive,
      isCustom: true,
      isTemplate: false,
      subcategories,
    };
  }

  /**
   * Helper para mergear template con override
   * Incluye subcategorías del template y custom subcategorías creadas bajo el template
   */
  private static mergeTemplate(
    template: any,
    overridesByTemplateId: Map<string, any>,
    userId: string,
    allOverrides: any[] = []
  ): MergedCategory {
    const override = overridesByTemplateId.get(template.id);

    // Merge template subcategories
    const templateSubcategories = template.subcategories?.map((sub: any) =>
      this.mergeTemplate(sub, overridesByTemplateId, userId, allOverrides)
    ) || [];

    // Si existe un override para este template, agregar custom subcategorías creadas bajo él
    const customSubcategories: MergedCategory[] = [];
    if (override) {
      // Buscar custom subcategorías que fueron creadas bajo este override
      const customSubs = allOverrides.filter(
        o => o.parentOverrideId === override.id && o.isActive && o.isCustom
      );
      customSubcategories.push(
        ...customSubs.map(sub => this.mergeCustomCategory(sub, allOverrides))
      );
    }

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
      subcategories: [...templateSubcategories, ...customSubcategories],
    };

    return merged;
  }
}
