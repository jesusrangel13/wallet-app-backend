import { TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import { DEFAULT_CATEGORY_TEMPLATES } from '../data/categoryTemplates';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

// Cache para templates (TTL: 24 horas)
const CACHE_KEY = 'category_templates';
const CACHE_TTL = 24 * 60 * 60; // 24 horas en segundos

export interface CategoryTemplateHierarchy {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  type: TransactionType;
  orderIndex: number;
  parentTemplateId?: string | null;
  subcategories: CategoryTemplateHierarchy[];
}

export class CategoryTemplateService {
  /**
   * Inicializa la base de datos con los 80 templates por defecto
   * Solo corre si no existen templates aún
   */
  static async initializeDefaultTemplates(): Promise<void> {
    try {
      const existingCount = await prisma.categoryTemplate.count();

      if (existingCount > 0) {
        logger.info(`CategoryTemplates already initialized (${existingCount} templates found)`);
        // Check if all templates from DEFAULT_CATEGORY_TEMPLATES exist
        await this.addMissingTemplates();
        return;
      }

      logger.info('Initializing 84 default category templates...');

      // Crear un mapa de templates por nombre para referencias de parents
      const templatesByName = new Map<string, string>();

      // Crear templates padres primero (sin parentId)
      const parentTemplates = DEFAULT_CATEGORY_TEMPLATES.filter(t => !t.parentName);

      for (const template of parentTemplates) {
        const created = await prisma.categoryTemplate.create({
          data: {
            name: template.name,
            icon: template.icon,
            color: template.color,
            type: template.type,
            orderIndex: template.orderIndex,
            isSystem: true,
            parentTemplateId: null,
          },
        });
        templatesByName.set(template.name, created.id);
      }

      // Crear templates hijos (con parentId)
      const childTemplates = DEFAULT_CATEGORY_TEMPLATES.filter(t => t.parentName);

      for (const template of childTemplates) {
        const parentId = templatesByName.get(template.parentName!);

        if (!parentId) {
          console.warn(`Parent template not found for: ${template.name} (parent: ${template.parentName})`);
          continue;
        }

        const created = await prisma.categoryTemplate.create({
          data: {
            name: template.name,
            icon: template.icon,
            color: template.color,
            type: template.type,
            orderIndex: template.orderIndex,
            isSystem: true,
            parentTemplateId: parentId,
          },
        });
        templatesByName.set(`${template.parentName}/${template.name}`, created.id);
      }

      logger.info(`Successfully initialized ${templatesByName.size} category templates`);
    } catch (error) {
      logger.error('Error initializing default templates:', error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Obtiene todos los templates organizados jerárquicamente
   * Utiliza cache para optimizar
   */
  // Simple in-memory cache
  private static templatesCache: { data: CategoryTemplateHierarchy[]; timestamp: number } | null = null;
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Obtiene todos los templates organizados jerárquicamente
   * Utiliza cache para optimizar
   */
  static async getAllTemplatesHierarchy(): Promise<CategoryTemplateHierarchy[]> {
    try {
      // Check cache
      if (
        this.templatesCache &&
        Date.now() - this.templatesCache.timestamp < this.CACHE_TTL_MS
      ) {
        return this.templatesCache.data;
      }

      const templates = await prisma.categoryTemplate.findMany({
        where: { parentTemplateId: null },
        include: {
          subcategories: {
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { orderIndex: 'asc' },
      });

      const hierarchical = templates.map(t => this.mapToHierarchy(t));

      // Set cache
      this.templatesCache = {
        data: hierarchical,
        timestamp: Date.now(),
      };

      return hierarchical;
    } catch (error) {
      console.error('Error fetching template hierarchy:', error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Obtiene templates por tipo de transacción
   */
  static async getTemplatesByType(type: TransactionType): Promise<CategoryTemplateHierarchy[]> {
    try {
      const templates = await prisma.categoryTemplate.findMany({
        where: {
          type,
          parentTemplateId: null,
        },
        include: {
          subcategories: {
            where: { type },
            orderBy: { orderIndex: 'asc' },
          },
        },
        orderBy: { orderIndex: 'asc' },
      });

      return templates.map(t => this.mapToHierarchy(t));
    } catch (error) {
      console.error(`Error fetching templates for type ${type}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Obtiene un template específico por ID
   */
  static async getTemplateById(id: string): Promise<CategoryTemplateHierarchy | null> {
    try {
      const template = await prisma.categoryTemplate.findUnique({
        where: { id },
        include: {
          subcategories: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      if (!template) return null;

      return this.mapToHierarchy(template);
    } catch (error) {
      console.error(`Error fetching template ${id}:`, error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Obtiene todos los templates como lista plana (para migración/debug)
   */
  static async getAllTemplates(type?: TransactionType) {
    try {
      const where = type ? { type } : {};

      return await prisma.categoryTemplate.findMany({
        where,
        include: {
          parent: {
            select: {
              id: true,
              name: true,
            },
          },
          subcategories: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ type: 'asc' }, { orderIndex: 'asc' }],
      });
    } catch (error) {
      console.error('Error fetching all templates:', error);
      throw new AppError(ErrorCodes.INTERNAL_SERVER_ERROR, 500);
    }
  }

  /**
   * Invalida el cache de templates
   */
  static async invalidateCache(): Promise<void> {
    try {
      // TODO: Implementar cuando Redis esté disponible
      // await redis.del(CACHE_KEY);
      logger.info('Category templates cache invalidated');
    } catch (error) {
      logger.warn('Error invalidating template cache:', error);
    }
  }

  /**
   * Helper para mapear template a estructura jerárquica
   */
  private static mapToHierarchy(
    template: any
  ): CategoryTemplateHierarchy {
    return {
      id: template.id,
      name: template.name,
      icon: template.icon,
      color: template.color,
      type: template.type,
      orderIndex: template.orderIndex,
      parentTemplateId: template.parentTemplateId || null,
      subcategories: template.subcategories?.map((sub: any) =>
        this.mapToHierarchy(sub)
      ) || [],
    };
  }

  /**
   * Adds missing templates from DEFAULT_CATEGORY_TEMPLATES that don't exist in DB
   */
  static async addMissingTemplates(): Promise<void> {
    try {
      // Get all existing templates
      const existingTemplates = await prisma.categoryTemplate.findMany({
        select: { name: true, id: true },
      });

      const existingNames = new Set(existingTemplates.map(t => t.name));
      const templatesByName = new Map(existingTemplates.map(t => [t.name, t.id]));

      // Find parent categories to add
      const missingParents = DEFAULT_CATEGORY_TEMPLATES
        .filter(t => !t.parentName && !existingNames.has(t.name));

      // Add missing parent templates
      for (const template of missingParents) {
        const created = await prisma.categoryTemplate.create({
          data: {
            name: template.name,
            icon: template.icon,
            color: template.color,
            type: template.type,
            orderIndex: template.orderIndex,
            isSystem: true,
            parentTemplateId: null,
          },
        });
        templatesByName.set(template.name, created.id);
        logger.info(`Added missing parent template: ${template.name}`);
      }

      // Find child categories to add
      const missingChildren = DEFAULT_CATEGORY_TEMPLATES
        .filter(t => t.parentName && !existingNames.has(t.name));

      // Add missing child templates
      for (const template of missingChildren) {
        const parentId = templatesByName.get(template.parentName!);

        if (!parentId) {
          logger.warn(`Parent template not found for: ${template.name} (parent: ${template.parentName})`);
          continue;
        }

        await prisma.categoryTemplate.create({
          data: {
            name: template.name,
            icon: template.icon,
            color: template.color,
            type: template.type,
            orderIndex: template.orderIndex,
            isSystem: true,
            parentTemplateId: parentId,
          },
        });
        logger.info(`Added missing child template: ${template.name} (parent: ${template.parentName})`);
      }

      const totalAdded = missingParents.length + missingChildren.length;
      if (totalAdded > 0) {
        logger.info(`Added ${totalAdded} missing category templates`);
      }
    } catch (error) {
      logger.error('Error adding missing templates:', error);
    }
  }
}
