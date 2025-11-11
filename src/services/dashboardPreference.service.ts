import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface WidgetConfig {
  id: string // unique widget instance ID
  type: string // widget type (e.g., 'cash-flow')
  settings?: {
    [key: string]: any
  }
}

export interface GridLayoutItem {
  i: string // widget instance ID
  x: number // grid x position
  y: number // grid y position
  w: number // width in grid units
  h: number // height in grid units
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

export interface DashboardPreference {
  id: string
  userId: string
  widgets: WidgetConfig[]
  layout: GridLayoutItem[]
  createdAt: Date
  updatedAt: Date
}

class DashboardPreferenceService {
  /**
   * Get user's dashboard preferences
   * If none exist, create default preferences
   */
  async getPreferences(userId: string): Promise<DashboardPreference> {
    let preference = await (prisma.userDashboardPreference as any).findUnique({
      where: { userId },
    })

    // If no preference exists, create default one
    if (!preference) {
      return this.createDefaultPreferences(userId)
    }

    return {
      id: preference.id,
      userId: preference.userId,
      widgets: (preference.widgets as unknown as WidgetConfig[]) || [],
      layout: (preference.layout as unknown as GridLayoutItem[]) || [],
      createdAt: preference.createdAt,
      updatedAt: preference.updatedAt,
    }
  }

  /**
   * Create default dashboard preferences for a user
   */
  async createDefaultPreferences(
    userId: string
  ): Promise<DashboardPreference> {
    const defaultWidgets: WidgetConfig[] = [
      { id: 'widget-1', type: 'total-balance' },
      { id: 'widget-2', type: 'monthly-income' },
      { id: 'widget-3', type: 'monthly-expenses' },
      { id: 'widget-4', type: 'groups' },
      { id: 'widget-5', type: 'quick-actions' },
      { id: 'widget-6', type: 'balances' },
      { id: 'widget-7', type: 'cash-flow' },
      { id: 'widget-8', type: 'expenses-by-category' },
      { id: 'widget-9', type: 'balance-trend' },
      { id: 'widget-10', type: 'group-balances' },
      { id: 'widget-11', type: 'account-balances' },
      { id: 'widget-12', type: 'recent-transactions' },
    ]

    const defaultLayout: GridLayoutItem[] = [
      // Summary cards row (now with h: 2 for better visibility)
      { i: 'widget-1', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
      { i: 'widget-2', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
      { i: 'widget-3', x: 2, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
      { i: 'widget-4', x: 3, y: 0, w: 1, h: 2, minW: 1, minH: 1 },
      // Quick actions
      { i: 'widget-5', x: 0, y: 2, w: 4, h: 2, minW: 2, minH: 1 },
      // Balances widget
      { i: 'widget-6', x: 0, y: 4, w: 4, h: 2, minW: 2, minH: 1 },
      // Charts grid (2 columns)
      { i: 'widget-7', x: 0, y: 6, w: 2, h: 2, minW: 2, minH: 1 },
      { i: 'widget-8', x: 2, y: 6, w: 2, h: 2, minW: 2, minH: 1 },
      { i: 'widget-9', x: 0, y: 8, w: 2, h: 2, minW: 2, minH: 1 },
      { i: 'widget-10', x: 2, y: 8, w: 2, h: 2, minW: 2, minH: 1 },
      { i: 'widget-11', x: 0, y: 10, w: 2, h: 2, minW: 2, minH: 1 },
      // Recent transactions full width
      { i: 'widget-12', x: 0, y: 12, w: 4, h: 2, minW: 2, minH: 1 },
    ]

    const preference = (await (prisma.userDashboardPreference as any).create({
      data: {
        userId,
        widgets: defaultWidgets,
        layout: defaultLayout,
      },
    })) as any

    return {
      id: preference.id,
      userId: preference.userId,
      widgets: (preference.widgets as unknown as WidgetConfig[]) || [],
      layout: (preference.layout as unknown as GridLayoutItem[]) || [],
      createdAt: preference.createdAt,
      updatedAt: preference.updatedAt,
    }
  }

  /**
   * Save user's dashboard preferences
   */
  async savePreferences(
    userId: string,
    widgets: WidgetConfig[],
    layout: GridLayoutItem[]
  ): Promise<DashboardPreference> {
    const preference = (await (prisma.userDashboardPreference as any).upsert({
      where: { userId },
      update: {
        widgets,
        layout,
        updatedAt: new Date(),
      },
      create: {
        userId,
        widgets,
        layout,
      },
    })) as any

    return {
      id: preference.id,
      userId: preference.userId,
      widgets: (preference.widgets as unknown as WidgetConfig[]) || [],
      layout: (preference.layout as unknown as GridLayoutItem[]) || [],
      createdAt: preference.createdAt,
      updatedAt: preference.updatedAt,
    }
  }

  /**
   * Reset user's dashboard to default preferences
   */
  async resetToDefaults(userId: string): Promise<DashboardPreference> {
    await (prisma.userDashboardPreference as any).deleteMany({
      where: { userId },
    })

    return this.createDefaultPreferences(userId)
  }

  /**
   * Add widget to user's dashboard
   */
  async addWidget(
    userId: string,
    widget: WidgetConfig
  ): Promise<DashboardPreference> {
    const preference = await this.getPreferences(userId)

    const updatedWidgets = [...preference.widgets, widget]

    // Add default layout item for new widget
    const defaultLayoutItem: GridLayoutItem = {
      i: widget.id,
      x: 0,
      y: Math.max(...preference.layout.map((l) => l.y), 0) + 3,
      w: 2,
      h: 2,
      minW: 1,
      minH: 1,
    }

    const updatedLayout = [...preference.layout, defaultLayoutItem]

    return this.savePreferences(userId, updatedWidgets, updatedLayout)
  }

  /**
   * Remove widget from user's dashboard
   */
  async removeWidget(userId: string, widgetId: string): Promise<DashboardPreference> {
    const preference = await this.getPreferences(userId)

    const updatedWidgets = preference.widgets.filter((w) => w.id !== widgetId)
    const updatedLayout = preference.layout.filter((l) => l.i !== widgetId)

    return this.savePreferences(userId, updatedWidgets, updatedLayout)
  }

  /**
   * Update widget settings
   */
  async updateWidgetSettings(
    userId: string,
    widgetId: string,
    settings: Record<string, any>
  ): Promise<DashboardPreference> {
    const preference = await this.getPreferences(userId)

    const updatedWidgets = preference.widgets.map((w) => {
      if (w.id === widgetId) {
        return {
          ...w,
          settings: {
            ...w.settings,
            ...settings,
          },
        }
      }
      return w
    })

    return this.savePreferences(userId, updatedWidgets, preference.layout)
  }

  /**
   * Update dashboard layout
   */
  async updateLayout(
    userId: string,
    layout: GridLayoutItem[]
  ): Promise<DashboardPreference> {
    const preference = await this.getPreferences(userId)
    return this.savePreferences(userId, preference.widgets, layout)
  }
}

export const dashboardPreferenceService = new DashboardPreferenceService()
