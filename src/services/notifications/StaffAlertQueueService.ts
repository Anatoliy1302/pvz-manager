import StorageService from '../StorageService';
import { generateSecureId } from '../../utils/generateSecureId';
import { safeParseJson } from '../../utils/safeJson';
import type { StaffAlertQueueItem } from './types';
import { STAFF_ALERT_QUEUE_KEY } from './types';
import notificationHistoryService from './NotificationHistoryService';
import localNotificationService from './LocalNotificationService';

class StaffAlertQueueService {
  async enqueueStaffAlert(
    recipientUserId: string,
    title: string,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      const raw = await StorageService.getItem(STAFF_ALERT_QUEUE_KEY);
      const queue = safeParseJson<StaffAlertQueueItem[]>(raw ?? '[]', []);
      queue.push({
        id: generateSecureId(),
        recipientUserId,
        title,
        message,
        data,
        createdAt: new Date().toISOString(),
      });
      await StorageService.setItem(STAFF_ALERT_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
    } catch (error) {
      console.error('Ошибка очереди уведомлений:', error);
    }
  }

  async deliverPendingStaffAlerts(userId: string): Promise<void> {
    if (!userId) return;
    try {
      const raw = await StorageService.getItem(STAFF_ALERT_QUEUE_KEY);
      const queue = safeParseJson<StaffAlertQueueItem[]>(raw ?? '[]', []);
      const mine = queue.filter((q) => q.recipientUserId === userId);
      if (mine.length === 0) return;

      const rest = queue.filter((q) => q.recipientUserId !== userId);
      await StorageService.setItem(STAFF_ALERT_QUEUE_KEY, JSON.stringify(rest));

      for (const alert of mine) {
        await notificationHistoryService.saveToHistory(
          alert.title,
          alert.message,
          'request',
          alert.data,
          userId
        );
        await localNotificationService.show({
          title: alert.title,
          body: alert.message,
          data: alert.data,
          notificationType: 'request',
          saveToHistory: false,
          userId,
        });
      }
    } catch (error) {
      console.error('Ошибка доставки очереди:', error);
    }
  }
}

export default new StaffAlertQueueService();
