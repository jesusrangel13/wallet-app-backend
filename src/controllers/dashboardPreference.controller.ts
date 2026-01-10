import { Response } from 'express'
import { dashboardPreferenceService } from '../services/dashboardPreference.service'
import { AuthRequest } from '../types/auth'
import logger from '../utils/logger';

export class DashboardPreferenceController {
  /**
   * GET /api/users/dashboard-preferences
   * Get user's dashboard preferences
   */
  static async getPreferences(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const preferences = await dashboardPreferenceService.getPreferences(userId)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error getting dashboard preferences:', error)
      return res.status(500).json({
        error: 'Failed to get dashboard preferences',
      })
    }
  }

  /**
   * PUT /api/users/dashboard-preferences
   * Save user's dashboard preferences (widgets and layout)
   */
  static async savePreferences(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId
      const { widgets, layout } = req.body

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!widgets || !layout) {
        return res.status(400).json({
          error: 'Missing required fields: widgets and layout',
        })
      }

      const preferences = await dashboardPreferenceService.savePreferences(
        userId,
        widgets,
        layout
      )

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error saving dashboard preferences:', error)
      return res.status(500).json({
        error: 'Failed to save dashboard preferences',
      })
    }
  }

  /**
   * POST /api/users/dashboard-preferences/widgets
   * Add widget to dashboard
   */
  static async addWidget(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId
      const { widget } = req.body

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!widget) {
        return res.status(400).json({ error: 'Missing required field: widget' })
      }

      const preferences = await dashboardPreferenceService.addWidget(userId, widget)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error adding widget:', error)
      return res.status(500).json({
        error: 'Failed to add widget',
      })
    }
  }

  /**
   * DELETE /api/users/dashboard-preferences/widgets/:widgetId
   * Remove widget from dashboard
   */
  static async removeWidget(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId
      const { widgetId } = req.params

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!widgetId) {
        return res.status(400).json({ error: 'Missing required parameter: widgetId' })
      }

      const preferences = await dashboardPreferenceService.removeWidget(userId, widgetId)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error removing widget:', error)
      return res.status(500).json({
        error: 'Failed to remove widget',
      })
    }
  }

  /**
   * PATCH /api/users/dashboard-preferences/widgets/:widgetId/settings
   * Update widget settings
   */
  static async updateWidgetSettings(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId
      const { widgetId } = req.params
      const { settings } = req.body

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!widgetId) {
        return res.status(400).json({ error: 'Missing required parameter: widgetId' })
      }

      if (!settings) {
        return res.status(400).json({ error: 'Missing required field: settings' })
      }

      const preferences = await dashboardPreferenceService.updateWidgetSettings(
        userId,
        widgetId,
        settings
      )

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error updating widget settings:', error)
      return res.status(500).json({
        error: 'Failed to update widget settings',
      })
    }
  }

  /**
   * PATCH /api/users/dashboard-preferences/layout
   * Update dashboard layout
   */
  static async updateLayout(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId
      const { layout } = req.body

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      if (!layout) {
        return res.status(400).json({ error: 'Missing required field: layout' })
      }

      const preferences = await dashboardPreferenceService.updateLayout(userId, layout)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error updating layout:', error)
      return res.status(500).json({
        error: 'Failed to update layout',
      })
    }
  }

  /**
   * DELETE /api/users/dashboard-preferences/reset
   * Reset dashboard to default preferences
   */
  static async resetToDefaults(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.userId

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const preferences = await dashboardPreferenceService.resetToDefaults(userId)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error: any) {
      logger.error('Error resetting dashboard preferences:', error)
      return res.status(500).json({
        error: 'Failed to reset dashboard preferences',
      })
    }
  }
}
