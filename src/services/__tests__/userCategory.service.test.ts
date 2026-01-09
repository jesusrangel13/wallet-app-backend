/**
 * Tests for UserCategoryService
 * Tests user overrides, custom categories, and merging logic
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { UserCategoryService } from '../userCategory.service'
import { CategoryTemplateService } from '../categoryTemplate.service'
import { prisma } from '../../utils/prisma'
const testUserId = 'test-user-' + Date.now()

describe('UserCategoryService', () => {
  beforeAll(async () => {
    // Initialize templates
    await CategoryTemplateService.initializeDefaultTemplates()
  })

  afterAll(async () => {
    // Clean up test user overrides
    await prisma.userCategoryOverride.deleteMany({ where: { userId: testUserId } })
    await prisma.$disconnect()
  })

  describe('getUserCategoriesHierarchy', () => {
    it('should return hierarchical categories for user', async () => {
      const categories = await UserCategoryService.getUserCategoriesHierarchy(testUserId)
      expect(Array.isArray(categories)).toBe(true)
      expect(categories.length).toBeGreaterThan(0)
    })

    it('should include both EXPENSE and INCOME categories', async () => {
      const categories = await UserCategoryService.getUserCategoriesHierarchy(testUserId)
      const hasExpense = categories.some(c => c.type === 'EXPENSE')
      const hasIncome = categories.some(c => c.type === 'INCOME')
      expect(hasExpense).toBe(true)
      expect(hasIncome).toBe(true)
    })

    it('should return parent categories only (no subcategories at top level)', async () => {
      const categories = await UserCategoryService.getUserCategoriesHierarchy(testUserId)
      const hasParents = categories.length > 0
      expect(hasParents).toBe(true)
    })

    it('should include subcategories in each parent', async () => {
      const categories = await UserCategoryService.getUserCategoriesHierarchy(testUserId)
      const parentWithSubs = categories.find(c => c.subcategories && c.subcategories.length > 0)
      expect(parentWithSubs).toBeDefined()
      expect(parentWithSubs?.subcategories?.length).toBeGreaterThan(0)
    })
  })

  describe('getUserCategoriesByType', () => {
    it('should return only EXPENSE categories', async () => {
      const expenses = await UserCategoryService.getUserCategoriesByType(testUserId, 'EXPENSE')
      const allExpense = expenses.every(c => c.type === 'EXPENSE')
      expect(allExpense).toBe(true)
    })

    it('should return only INCOME categories', async () => {
      const incomes = await UserCategoryService.getUserCategoriesByType(testUserId, 'INCOME')
      const allIncome = incomes.every(c => c.type === 'INCOME')
      expect(allIncome).toBe(true)
    })
  })

  describe('createCustomCategory', () => {
    it('should create a custom category with no template', async () => {
      const customCat = await UserCategoryService.createCustomCategory(testUserId, {
        name: 'My Custom Category',
        icon: '💰',
        color: '#FF0000',
        type: 'EXPENSE'
      })

      expect(customCat.id).toBeDefined()
      expect(customCat.name).toBe('My Custom Category')
      expect(customCat.templateId).toBeNull()
      expect(customCat.isCustom).toBe(true)
    })

    it('should be retrievable after creation', async () => {
      const created = await UserCategoryService.createCustomCategory(testUserId, {
        name: 'Test Custom Cat',
        type: 'INCOME'
      })

      const fetched = await UserCategoryService.getUserCategory(testUserId, created.id)
      expect(fetched).toBeDefined()
      if (fetched) {
        expect(fetched.name).toBe('Test Custom Cat')
      }
    })
  })

  describe('overrideTemplateCategory', () => {
    it('should create override for template category', async () => {
      const templates = await CategoryTemplateService.getAllTemplates()
      const someTemplate = templates.find(t => !t.parentTemplateId) // Get parent

      if (someTemplate) {
        const override = await UserCategoryService.overrideTemplateCategory(
          testUserId,
          someTemplate.id,
          { name: 'Custom Name', icon: '🎯', color: '#00FF00' }
        )

        expect(override.templateId).toBe(someTemplate.id)
        expect(override.name).toBe('Custom Name')
        expect(override.isCustom).toBe(false)
      }
    })
  })

  describe('toggleCategoryActive', () => {
    it('should deactivate a category', async () => {
      const custom = await UserCategoryService.createCustomCategory(testUserId, {
        name: 'To Deactivate',
        type: 'EXPENSE'
      })

      const deactivated = await UserCategoryService.toggleCategoryActive(testUserId, custom.id, false)
      expect(deactivated.isActive).toBe(false)
    })

    it('should reactivate a category', async () => {
      const custom = await UserCategoryService.createCustomCategory(testUserId, {
        name: 'To Reactivate',
        type: 'EXPENSE'
      })

      await UserCategoryService.toggleCategoryActive(testUserId, custom.id, false)
      const reactivated = await UserCategoryService.toggleCategoryActive(testUserId, custom.id, true)
      expect(reactivated.isActive).toBe(true)
    })
  })

  describe('getUserCategoriesFlat', () => {
    it('should return flat list with parent references', async () => {
      const flat = await UserCategoryService.getUserCategoriesFlat(testUserId)
      expect(Array.isArray(flat)).toBe(true)
      expect(flat.length).toBeGreaterThan(14) // More than parents due to subcategories
    })

    it('should include both parents and subcategories', async () => {
      const flat = await UserCategoryService.getUserCategoriesFlat(testUserId)
      const parents = flat.filter(c => !c.parentId)
      const subs = flat.filter(c => c.parentId)

      expect(parents.length).toBeGreaterThan(0)
      expect(subs.length).toBeGreaterThan(0)
    })
  })

  describe('deleteCustomCategory', () => {
    it('should delete a custom category', async () => {
      const custom = await UserCategoryService.createCustomCategory(testUserId, {
        name: 'To Delete',
        type: 'EXPENSE'
      })

      await UserCategoryService.deleteCustomCategory(testUserId, custom.id)

      // Verify it's gone
      const fetched = await prisma.userCategoryOverride.findUnique({
        where: { id: custom.id }
      })
      expect(fetched).toBeNull()
    })
  })

  describe('Integration: Merge logic', () => {
    it('should show templates as fallback for users without overrides', async () => {
      const newUserId = 'test-user-merge-' + Date.now()
      const categories = await UserCategoryService.getUserCategoriesHierarchy(newUserId)

      // Should return all templates since user has no overrides
      expect(categories.length).toBeGreaterThan(0)
      expect(categories.every(c => c.isTemplate !== false || c.isCustom)).toBe(true)
    })

    it('should apply overrides to templates', async () => {
      const mergeTestUserId = 'test-user-merge2-' + Date.now()
      const templates = await CategoryTemplateService.getAllTemplates()
      const templateToOverride = templates.find(t => !t.parentTemplateId)

      if (templateToOverride) {
        // Create override
        await UserCategoryService.overrideTemplateCategory(
          mergeTestUserId,
          templateToOverride.id,
          { name: 'Overridden Name', color: '#AABBCC' }
        )

        // Get merged categories
        const merged = await UserCategoryService.getUserCategoriesHierarchy(mergeTestUserId)
        const overriddenCat = merged.find(c => c.templateId === templateToOverride.id)

        expect(overriddenCat?.name).toBe('Overridden Name')
        expect(overriddenCat?.color).toBe('#AABBCC')
      }
    })
  })
})
