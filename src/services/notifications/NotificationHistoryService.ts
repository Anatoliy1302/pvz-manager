import StorageService from '../StorageService';
import DataService from '../DataService';
import { generateUuidV4 } from '../../utils/generateSecureId';
import { isUuid } from '../../utils/supabaseHelpers';
import { safeParseJson } from '../../utils/safeJson';
import { hasSupabaseSession } from '../SupabaseAuthService';
import {
  fetchNotificationsFromSupabase,
  markAllNotificationsReadInSupabase,
  markNotificationReadInSupabase,
  mergeNotifications,
  upsertNotificationToSupabase,
} from '../SupabaseNotificationService';
import { loadExpoNotificationsModule } from './expoNotificationsBridge';
import type { NotificationRecord, NotificationType } from './types';
import { NOTIFICATIONS_STORAGE_KEY } from './types';

class NotificationHistoryService {
  async saveToHistory(
    title: string,
    message: string,
    type: NotificationType,
    data?: Record<string, unknown>,
    recipientUserId?: string
  ): Promise<NotificationRecord | null> {
    try {
      const stored = await StorageService.getItem(NOTIFICATIONS_STORAGE_KEY);
      const notifications = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);

      const newNotification: NotificationRecord = {
        id: generateUuidV4(),
        title,
        message,
        type,
        isRead: false,
        createdAt: new Date().toISOString(),
        data,
        recipientUserId,
      };

      notifications.unshift(newNotification);
      const trimmed = notifications.slice(0, 200);
      await StorageService.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(trimmed));

      if (recipientUserId && (await hasSupabaseSession())) {
        await upsertNotificationToSupabase(newNotification, recipientUserId);
      }

      await this.updateBadgeCount(recipientUserId);
      return newNotification;
    } catch (error) {
      console.error('Ошибка сохранения уведомления:', error);
      return null;
    }
  }

  /** Сохранить push, пришедший с другого устройства (без дубля по notificationId). */
  async savePushNotification(params: {
    title: string;
    message: string;
    type: NotificationType;
    data?: Record<string, unknown>;
    userId?: string;
  }): Promise<void> {
    const { title, message, type, data, userId } = params;
    const notificationId =
      typeof data?.notificationId === 'string' ? data.notificationId : undefined;

    try {
      const stored = await StorageService.getItem(NOTIFICATIONS_STORAGE_KEY);
      const notifications = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);

      if (notificationId && notifications.some((item) => item.id === notificationId)) {
        await this.updateBadgeCount(userId);
        return;
      }

      const newNotification: NotificationRecord = {
        id: notificationId && isUuid(notificationId) ? notificationId : generateUuidV4(),
        title,
        message,
        type,
        isRead: false,
        createdAt: new Date().toISOString(),
        data,
        recipientUserId: userId,
      };

      notifications.unshift(newNotification);
      await StorageService.setItem(
        NOTIFICATIONS_STORAGE_KEY,
        JSON.stringify(notifications.slice(0, 200))
      );
      DataService.emitChange('notifications');
      if (userId) {
        DataService.emitChange(`notifications_${userId}`);
      }
      await this.updateBadgeCount(userId);
    } catch (error) {
      console.error('Ошибка сохранения push-уведомления:', error);
    }
  }

  async updateBadgeCount(userId?: string): Promise<void> {
    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    const all = await this.getNotifications(userId);
    const unread = all.filter((item) => !item.isRead).length;
    await Notifications.setBadgeCountAsync(unread);
  }

  async refreshNotificationsCache(userId?: string): Promise<void> {
    const stored = await StorageService.getItem(NOTIFICATIONS_STORAGE_KEY);
    let all = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);
    const remote = await fetchNotificationsFromSupabase();

    if (remote) {
      all = mergeNotifications(all, remote);
      await StorageService.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(all));
    }

    DataService.emitChange('notifications');
    if (userId) {
      DataService.emitChange(`notifications_${userId}`);
    }

    await this.updateBadgeCount(userId);
  }

  async getNotifications(userId?: string): Promise<NotificationRecord[]> {
    try {
      const stored = await StorageService.getItem(NOTIFICATIONS_STORAGE_KEY);
      let all = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);

      const remote = await fetchNotificationsFromSupabase();
      if (remote) {
        all = mergeNotifications(all, remote);
        await StorageService.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(all));
      }

      if (!userId) return all;
      return all.filter((n) => !n.recipientUserId || n.recipientUserId === userId);
    } catch (error) {
      console.error('Ошибка загрузки уведомлений:', error);
      return [];
    }
  }

  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    try {
      const stored = await StorageService.getItem(NOTIFICATIONS_STORAGE_KEY);
      const notifications = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);
      const updated = notifications.map((n) =>
        n.id === notificationId ? { ...n, isRead: true } : n
      );
      await StorageService.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
      await markNotificationReadInSupabase(notificationId);
      await this.updateBadgeCount(userId);
    } catch (error) {
      console.error('Ошибка отметки уведомления:', error);
    }
  }

  async markAllAsRead(userId?: string): Promise<void> {
    try {
      const stored = await StorageService.getItem(NOTIFICATIONS_STORAGE_KEY);
      const notifications = safeParseJson<NotificationRecord[]>(stored ?? '[]', []);
      const updated = notifications.map((n) => {
        if (userId && n.recipientUserId && n.recipientUserId !== userId) {
          return n;
        }
        return { ...n, isRead: true };
      });
      await StorageService.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
      if (userId) {
        await markAllNotificationsReadInSupabase();
      }
      await this.updateBadgeCount(userId);
    } catch (error) {
      console.error('Ошибка отметки уведомлений:', error);
    }
  }

  async clearAllNotifications(userId?: string): Promise<void> {
    try {
      await StorageService.deleteItem(NOTIFICATIONS_STORAGE_KEY);
      await this.updateBadgeCount(userId);
    } catch (error) {
      console.error('Ошибка очистки уведомлений:', error);
    }
  }
}

export default new NotificationHistoryService();
