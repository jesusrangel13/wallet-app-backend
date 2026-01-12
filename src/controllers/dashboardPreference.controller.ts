import { Response, NextFunction } from 'express'
import { dashboardPreferenceService } from '../services/dashboardPreference.service'
import { AuthRequest } from '../types/auth'
import { AppError } from '../middleware/errorHandler'
import { ErrorCodes } from '../constants/errorCodes'

export class DashboardPreferenceController {
  /**
   * GET /api/v1/dashboard-preferences
   * Get user's dashboard preferences
   */
  static async getPreferences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      const preferences = await dashboardPreferenceService.getPreferences(userId)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PUT /api/v1/dashboard-preferences
   * Save user's dashboard preferences (widgets and layout)
   */
  static async savePreferences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      const { widgets, layout } = req.body

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      if (!widgets || !layout) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400, 'Missing required fields: widgets and layout')
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
    } catch (error) {
      next(error)
    }
  }

  /**
   * POST /api/v1/dashboard-preferences/widgets
   * Add widget to dashboard
   */
  static async addWidget(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      const { widget } = req.body

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      if (!widget) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400, 'Missing required field: widget')
      }

      const preferences = await dashboardPreferenceService.addWidget(userId, widget)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * DELETE /api/v1/dashboard-preferences/widgets/:widgetId
   * Remove widget from dashboard
   */
  static async removeWidget(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      const { widgetId } = req.params

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      if (!widgetId) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400, 'Missing required parameter: widgetId')
      }

      const preferences = await dashboardPreferenceService.removeWidget(userId, widgetId)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/v1/dashboard-preferences/widgets/:widgetId/settings
   * Update widget settings
   */
  static async updateWidgetSettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      const { widgetId } = req.params
      const { settings } = req.body

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      if (!widgetId) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400, 'Missing required parameter: widgetId')
      }

      if (!settings) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400, 'Missing required field: settings')
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
    } catch (error) {
      next(error)
    }
  }

  /**
   * PATCH /api/v1/dashboard-preferences/layout
   * Update dashboard layout
   */
  static async updateLayout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId
      const { layout } = req.body

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      if (!layout) {
        throw new AppError(ErrorCodes.BAD_REQUEST, 400, 'Missing required field: layout')
      }

      const preferences = await dashboardPreferenceService.updateLayout(userId, layout)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error) {
      next(error)
    }
  }

  /**
   * DELETE /api/v1/dashboard-preferences/reset
   * Reset dashboard to default preferences
   */
  static async resetToDefaults(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId

      if (!userId) {
        throw new AppError(ErrorCodes.UNAUTHORIZED, 401, 'Unauthorized')
      }

      const preferences = await dashboardPreferenceService.resetToDefaults(userId)

      return res.status(200).json({
        success: true,
        data: preferences,
      })
    } catch (error) {
      next(error)
    }
  }
}
