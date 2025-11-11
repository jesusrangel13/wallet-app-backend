import { PrismaClient, NotificationType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: any;
}

/**
 * Create a new notification for a user
 */
export const createNotification = async ({
  userId,
  type,
  title,
  message,
  data,
}: CreateNotificationData) => {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: data || null,
    },
  });

  return notification;
};

/**
 * Get all notifications for a user
 */
export const getAllNotifications = async (userId: string, limit: number = 50) => {
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return notifications;
};

/**
 * Get unread notifications for a user
 */
export const getUnreadNotifications = async (userId: string) => {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      isRead: false,
    },
    orderBy: { createdAt: 'desc' },
  });

  return notifications;
};

/**
 * Get count of unread notifications for a user
 */
export const getUnreadCount = async (userId: string): Promise<number> => {
  const count = await prisma.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });

  return count;
};

/**
 * Mark a notification as read
 */
export const markAsRead = async (notificationId: string, userId: string) => {
  // Verify the notification belongs to the user
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (notification.userId !== userId) {
    throw new AppError('Unauthorized to mark this notification as read', 403);
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });

  return updated;
};

/**
 * Mark all notifications as read for a user
 */
export const markAllAsRead = async (userId: string) => {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      isRead: false,
    },
    data: { isRead: true },
  });

  return result;
};

/**
 * Delete a notification
 */
export const deleteNotification = async (notificationId: string, userId: string) => {
  // Verify the notification belongs to the user
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (notification.userId !== userId) {
    throw new AppError('Unauthorized to delete this notification', 403);
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });

  return { message: 'Notification deleted successfully' };
};

/**
 * Delete all read notifications for a user
 */
export const deleteReadNotifications = async (userId: string) => {
  const result = await prisma.notification.deleteMany({
    where: {
      userId,
      isRead: true,
    },
  });

  return result;
};
