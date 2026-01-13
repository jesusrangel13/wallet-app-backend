/**
 * Tests for CategoryTemplateService
 * Tests template initialization, retrieval, and hierarchy
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { CategoryTemplateService } from '../categoryTemplate.service'
import { prisma } from '../../utils/prisma'

describe('CategoryTemplateService', () => {
  beforeAll(async () => {
    // Clean up test data
    await prisma.categoryTemplate.deleteMany({})
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('initializeDefaultTemplates', () => {
    it('should initialize 80 default templates on first call', async () => {
      await CategoryTemplateService.initializeDefaultTemplates()
      const count = await prisma.categoryTemplate.count()
      expect(count).toBe(80)
    })

    it('should be idempotent - not create duplicates on second call', async () => {
      await CategoryTemplateService.initializeDefaultTemplates()
      const count = await prisma.categoryTemplate.count()
      expect(count).toBe(80) // Still 80, not 160
    })

    it('should create 10 parent expense categories', async () => {
      const expenseParents = await prisma.categoryTemplate.count({
        where: { type: 'EXPENSE', parentTemplateId: null }
      })
      expect(expenseParents).toBe(10)
    })

    it('should create 4 parent income categories', async () => {
      const incomeParents = await prisma.categoryTemplate.count({
        where: { type: 'INCOME', parentTemplateId: null }
      })
      expect(incomeParents).toBe(4)
    })

    it('should create subcategories for each parent', async () => {
      const subcategories = await prisma.categoryTemplate.count({
        where: { parentTemplateId: { not: null } }
      })
      expect(subcategories).toBe(66) // 10*5 + 4*4 = 50 + 16
    })
  })

  describe('getAllTemplates', () => {
    it('should return all 80 templates in flat list', async () => {
      const templates = await CategoryTemplateService.getAllTemplates()
      expect(templates.length).toBe(80)
    })

    it('should include both EXPENSE and INCOME types', async () => {
      const templates = await CategoryTemplateService.getAllTemplates()
      const hasExpense = templates.some(t => t.type === 'EXPENSE')
      const hasIncome = templates.some(t => t.type === 'INCOME')
      expect(hasExpense).toBe(true)
      expect(hasIncome).toBe(true)
    })
  })

  describe('getAllTemplatesHierarchy', () => {
    it('should return only parent categories (no parentTemplateId)', async () => {
      const hierarchy = await CategoryTemplateService.getAllTemplatesHierarchy()
      const allHaveNoParent = hierarchy.every(t => !t.parentTemplateId)
      expect(allHaveNoParent).toBe(true)
    })

    it('should return 14 parent categories (10 expense + 4 income)', async () => {
      const hierarchy = await CategoryTemplateService.getAllTemplatesHierarchy()
      expect(hierarchy.length).toBe(14)
    })

    it('should include subcategories in each parent', async () => {
      const hierarchy = await CategoryTemplateService.getAllTemplatesHierarchy()
      const parentWithSubs = hierarchy.find(t => t.subcategories && t.subcategories.length > 0)
      expect(parentWithSubs).toBeDefined()
      expect(parentWithSubs?.subcategories?.length).toBeGreaterThan(0)
    })
  })

  describe('getTemplatesByType', () => {
    it('should return only EXPENSE templates', async () => {
      const expenses = await CategoryTemplateService.getTemplatesByType('EXPENSE')
      const allExpense = expenses.every(t => t.type === 'EXPENSE')
      expect(allExpense).toBe(true)
      expect(expenses.length).toBeGreaterThan(0)
    })

    it('should return only INCOME templates', async () => {
      const incomes = await CategoryTemplateService.getTemplatesByType('INCOME')
      const allIncome = incomes.every(t => t.type === 'INCOME')
      expect(allIncome).toBe(true)
      expect(incomes.length).toBeGreaterThan(0)
    })

    it('should return 60 EXPENSE templates (10 parents + 50 subcategories)', async () => {
      const expenses = await CategoryTemplateService.getTemplatesByType('EXPENSE')
      expect(expenses.length).toBe(60)
    })

    it('should return 20 INCOME templates (4 parents + 16 subcategories)', async () => {
      const incomes = await CategoryTemplateService.getTemplatesByType('INCOME')
      expect(incomes.length).toBe(20)
    })
  })

  describe('getTemplateById', () => {
    it('should get a template with subcategories', async () => {
      const templates = await CategoryTemplateService.getAllTemplates()
      const parentTemplate = templates.find(t => !t.parentTemplateId)

      if (parentTemplate) {
        const fetched = await CategoryTemplateService.getTemplateById(parentTemplate.id)
        expect(fetched).not.toBeNull()
        if (fetched) {
          expect(fetched.id).toBe(parentTemplate.id)
          expect(fetched.name).toBe(parentTemplate.name)
        }
      }
    })
  })
})
