import { apiRequest } from './apiClient';
import type { NotificationRecord } from '../src/services/notifications/types';

export async function upsertNotificationForUser(
  recipientUserId: string,
  notification: NotificationRecord
): Promise<NotificationRecord | null> {
  if (!recipientUserId) return null;
  try {
    const result = await apiRequest<{ notification?: NotificationRecord }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ recipientUserId, notification }),
    });
    return result?.notification ?? notification;
  } catch (error) {
    if (__DEV__) {
      console.warn('upsertNotificationForUser:', error);
    }
    return null;
  }
}
