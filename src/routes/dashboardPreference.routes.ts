import { Router } from 'express'
import { DashboardPreferenceController } from '../controllers/dashboardPreference.controller'
import { authenticate } from '../middleware/auth'

const router = Router()

/**
 * Dashboard Preference Routes
 * All routes require authentication via authenticate middleware
 */

// Get user's dashboard preferences
router.get('/dashboard-preferences', authenticate, DashboardPreferenceController.getPreferences)

// Save user's dashboard preferences (widgets and layout)
router.put('/dashboard-preferences', authenticate, DashboardPreferenceController.savePreferences)

// Add widget to dashboard
router.post('/dashboard-preferences/widgets', authenticate, DashboardPreferenceController.addWidget)

// Remove widget from dashboard
router.delete('/dashboard-preferences/widgets/:widgetId', authenticate, DashboardPreferenceController.removeWidget)

// Update widget settings
router.patch('/dashboard-preferences/widgets/:widgetId/settings', authenticate, DashboardPreferenceController.updateWidgetSettings)

// Update dashboard layout
router.patch('/dashboard-preferences/layout', authenticate, DashboardPreferenceController.updateLayout)

// Reset dashboard to default preferences
router.delete('/dashboard-preferences/reset', authenticate, DashboardPreferenceController.resetToDefaults)

export default router
