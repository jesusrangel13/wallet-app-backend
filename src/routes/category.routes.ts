import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import * as categoryTemplateController from '../controllers/categoryTemplate.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All category routes require authentication
router.use(authenticate);

// Legacy category routes (backward compatible)
router.post('/', categoryController.createCategory);
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategoryById);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

// New template routes (USE_CATEGORY_TEMPLATES enabled)
// User's merged categories (templates + overrides + custom) - should be called first to avoid conflicts
router.get('/user/categories', categoryTemplateController.getUserCategories);
// Global templates
router.get('/templates/all', categoryTemplateController.getAllTemplates);
router.get('/templates/hierarchy', categoryTemplateController.getTemplatesHierarchy);
// Overrides management
router.post('/overrides', categoryTemplateController.createCategoryOverride);
router.get('/overrides/:id', categoryTemplateController.getCategoryOverride);
router.put('/overrides/:id', categoryTemplateController.updateCategoryOverride);
router.delete('/overrides/:id', categoryTemplateController.deleteCategoryOverride);
// Custom categories
router.post('/custom', categoryTemplateController.createCustomCategory);
router.get('/custom/all', categoryTemplateController.getUserCustomCategories);

export default router;
