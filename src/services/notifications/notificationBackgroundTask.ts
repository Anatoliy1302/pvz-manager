import {
  loadExpoNotificationsModule,
  supportsExpoNotificationsModule,
} from './expoNotificationsBridge';
import notificationHistoryService from './NotificationHistoryService';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

let backgroundTaskRegistered = false;

async function ensureBackgroundTaskDefined(): Promise<boolean> {
  try {
    const TaskManager = await import('expo-task-manager');

    if (!TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
      TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
        if (error) {
          console.warn('Background notification task error:', error.message);
          return;
        }

        const payload = data as {
          notification?: { request?: { content?: { data?: unknown } } };
        };
        const notificationData = payload?.notification?.request?.content?.data;
        if (notificationData && typeof notificationData === 'object') {
          await notificationHistoryService.updateBadgeCount();
        }
      });
    }

    return true;
  } catch (error) {
    console.warn('expo-task-manager недоступен:', error);
    return false;
  }
}

export async function registerBackgroundNotificationTask(): Promise<void> {
  if (!supportsExpoNotificationsModule || backgroundTaskRegistered) return;

  const taskReady = await ensureBackgroundTaskDefined();
  if (!taskReady) return;

  const Notifications = await loadExpoNotificationsModule();
  if (!Notifications) return;

  try {
    const TaskManager = await import('expo-task-manager');
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (isRegistered) {
      backgroundTaskRegistered = true;
      return;
    }

    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    backgroundTaskRegistered = true;
  } catch (error) {
    console.warn('Не удалось зарегистрировать background notification task:', error);
  }
}
