import { PrismaClient, TransactionType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { DEFAULT_CATEGORY_TEMPLATES } from '../data/categoryTemplates';

const prisma = new PrismaClient();

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
        console.log(`✓ CategoryTemplates already initialized (${existingCount} templates found)`);
        return;
      }

      console.log('Initializing 80 default category templates...');

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

      console.log(`✓ Successfully initialized ${templatesByName.size} category templates`);
    } catch (error) {
      console.error('Error initializing default templates:', error);
      throw new AppError('Failed to initialize category templates', 500);
    }
  }

  /**
   * Obtiene todos los templates organizados jerárquicamente
   * Utiliza cache para optimizar
   */
  static async getAllTemplatesHierarchy(): Promise<CategoryTemplateHierarchy[]> {
    try {
      // TODO: Implementar cache con Redis cuando esté disponible
      // const cached = await redis.get(CACHE_KEY);
      // if (cached) return JSON.parse(cached);

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

      // TODO: Cachear resultado
      // await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(hierarchical));

      return hierarchical;
    } catch (error) {
      console.error('Error fetching template hierarchy:', error);
      throw new AppError('Failed to fetch category templates', 500);
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
      throw new AppError('Failed to fetch category templates', 500);
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
      throw new AppError('Failed to fetch category template', 500);
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
      throw new AppError('Failed to fetch category templates', 500);
    }
  }

  /**
   * Invalida el cache de templates
   */
  static async invalidateCache(): Promise<void> {
    try {
      // TODO: Implementar cuando Redis esté disponible
      // await redis.del(CACHE_KEY);
      console.log('Category templates cache invalidated');
    } catch (error) {
      console.warn('Error invalidating template cache:', error);
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
      subcategories: template.subcategories?.map((sub: any) =>
        this.mapToHierarchy(sub)
      ) || [],
    };
  }
}
