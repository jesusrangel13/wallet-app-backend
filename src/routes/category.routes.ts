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
router.get('/templates/all', categoryTemplateController.getAllTemplates);
router.get('/templates/hierarchy', categoryTemplateController.getTemplatesHierarchy);
router.post('/overrides', categoryTemplateController.createCategoryOverride);
router.get('/overrides/:id', categoryTemplateController.getCategoryOverride);
router.put('/overrides/:id', categoryTemplateController.updateCategoryOverride);
router.delete('/overrides/:id', categoryTemplateController.deleteCategoryOverride);
router.post('/custom', categoryTemplateController.createCustomCategory);
router.get('/custom/all', categoryTemplateController.getUserCustomCategories);

export default router;
