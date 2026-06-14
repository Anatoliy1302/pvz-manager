export type NotificationType = 'shift' | 'schedule' | 'request' | 'swap' | 'system';

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
  recipientUserId?: string;
}

export interface StaffAlertQueueItem {
  id: string;
  recipientUserId: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export type UserRole = 'owner' | 'admin' | 'employee';

export const USER_PUSH_TOKENS_KEY = 'user_push_tokens';
export const STAFF_ALERT_QUEUE_KEY = 'staff_alert_queue';
export const NOTIFICATIONS_STORAGE_KEY = 'notifications';
