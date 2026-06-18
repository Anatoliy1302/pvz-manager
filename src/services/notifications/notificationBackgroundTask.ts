import { Platform } from 'react-native';
import {
  loadExpoNotificationsModule,
  supportsExpoNotificationsModule,
} from './expoNotificationsBridge';
import notificationHistoryService from './NotificationHistoryService';

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';

let backgroundTaskRegistered = false;
let backgroundTaskSkipped = false;

function isBackgroundRemoteNotificationsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const coded = error as Error & { code?: string };
  return (
    coded.code === 'E_BACKGROUND_REMOTE_NOTIFICATIONS_DISABLED' ||
    coded.message.includes('Background remote notifications have not been configured')
  );
}

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
  if (!supportsExpoNotificationsModule || backgroundTaskRegistered || backgroundTaskSkipped) {
    return;
  }

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
    if (isBackgroundRemoteNotificationsError(error)) {
      backgroundTaskSkipped = true;
      if (__DEV__ && Platform.OS === 'ios') {
        console.log(
          'iOS: фоновый обработчик push не активен — нужна пересборка dev client ' +
            '(enableBackgroundRemoteNotifications уже в app.json). Обычные push работают.'
        );
      }
      return;
    }
    console.warn('Не удалось зарегистрировать background notification task:', error);
  }
}
