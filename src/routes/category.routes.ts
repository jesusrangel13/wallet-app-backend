import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import * as categoryTemplateController from '../controllers/categoryTemplate.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All category routes require authentication
router.use(authenticate);

// ⚠️  IMPORTANT: Specific routes MUST come before parameterized /:id routes
// Otherwise GET /user/categories would be caught by GET /:id with id='user'

// New template routes (USE_CATEGORY_TEMPLATES enabled)
// User's merged categories (templates + overrides + custom) - MUST be before /:id
router.get('/user/categories', categoryTemplateController.getUserCategories);
// Global templates - MUST be before /:id
router.get('/templates/all', categoryTemplateController.getAllTemplates);
router.get('/templates/hierarchy', categoryTemplateController.getTemplatesHierarchy);
// Custom categories - MUST be before /:id
router.post('/custom', categoryTemplateController.createCustomCategory);
router.get('/custom/all', categoryTemplateController.getUserCustomCategories);
// Overrides management - MUST be before /:id to prevent /overrides/:id from being caught
router.post('/overrides', categoryTemplateController.createCategoryOverride);
router.get('/overrides/:id', categoryTemplateController.getCategoryOverride);
router.put('/overrides/:id', categoryTemplateController.updateCategoryOverride);
router.delete('/overrides/:id', categoryTemplateController.deleteCategoryOverride);

// Legacy category routes (backward compatible) - MUST be last so they don't intercept new routes
router.post('/', categoryController.createCategory);
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategoryById);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

export default router;
