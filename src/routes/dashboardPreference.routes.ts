import { Router } from 'express'
import { DashboardPreferenceController } from '../controllers/dashboardPreference.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

/**
 * Dashboard Preference Routes
 * Base path: /api/v1/dashboard-preferences
 * All routes require authentication via authenticate middleware
 */

// Get user's dashboard preferences
// GET /api/v1/dashboard-preferences
router.get('/', authenticate, DashboardPreferenceController.getPreferences)

// Save user's dashboard preferences (widgets and layout)
// PUT /api/v1/dashboard-preferences
router.put('/', authenticate, DashboardPreferenceController.savePreferences)

// Add widget to dashboard
// POST /api/v1/dashboard-preferences/widgets
router.post('/widgets', authenticate, DashboardPreferenceController.addWidget)

// Remove widget from dashboard
// DELETE /api/v1/dashboard-preferences/widgets/:widgetId
router.delete('/widgets/:widgetId', authenticate, DashboardPreferenceController.removeWidget)

// Update widget settings
// PATCH /api/v1/dashboard-preferences/widgets/:widgetId/settings
router.patch('/widgets/:widgetId/settings', authenticate, DashboardPreferenceController.updateWidgetSettings)

// Update dashboard layout
// PATCH /api/v1/dashboard-preferences/layout
router.patch('/layout', authenticate, DashboardPreferenceController.updateLayout)

// Reset dashboard to default preferences
// DELETE /api/v1/dashboard-preferences/reset
router.delete('/reset', authenticate, DashboardPreferenceController.resetToDefaults)

export default router
