import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import * as categoryTemplateController from '../controllers/categoryTemplate.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All category routes require authentication
router.use(authenticate);

// ========================================
// NEW TEMPLATE-BASED CATEGORY SYSTEM
// ========================================

// User's merged categories (templates + overrides + custom)
router.get('/user/categories', categoryTemplateController.getUserCategories);

// Global templates
router.get('/templates/all', categoryTemplateController.getAllTemplates);
router.get('/templates/hierarchy', categoryTemplateController.getTemplatesHierarchy);

// Custom categories
router.post('/custom', categoryTemplateController.createCustomCategory);
router.get('/custom/all', categoryTemplateController.getUserCustomCategories);

// Overrides management
router.post('/overrides', categoryTemplateController.createCategoryOverride);
router.get('/overrides/:id', categoryTemplateController.getCategoryOverride);
router.put('/overrides/:id', categoryTemplateController.updateCategoryOverride);
router.delete('/overrides/:id', categoryTemplateController.deleteCategoryOverride);

// ========================================
// MAIN CATEGORY ENDPOINT (uses new system)
// ========================================

// GET /api/categories - Returns merged categories from templates + overrides
router.get('/', categoryController.getCategories);

export default router;
