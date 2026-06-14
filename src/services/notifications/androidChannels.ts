import { Platform } from 'react-native';
import type { NotificationType } from './types';
import type { StoredNotificationSettings } from '../../utils/notificationSettingsHelpers';
import { loadExpoNotificationsModule } from './expoNotificationsBridge';

export const ANDROID_CHANNEL_IDS: Record<NotificationType, string> = {
  shift: 'shifts',
  schedule: 'schedule',
  request: 'requests',
  swap: 'swap',
  system: 'system',
};

const CHANNEL_LABELS: Record<NotificationType, string> = {
  shift: 'Смены',
  schedule: 'Расписание',
  request: 'Заявки',
  swap: 'Обмен смен',
  system: 'Системные',
};

export function channelIdForType(type: NotificationType): string {
  return ANDROID_CHANNEL_IDS[type] ?? ANDROID_CHANNEL_IDS.system;
}

export async function ensureAndroidNotificationChannels(
  settings: StoredNotificationSettings
): Promise<void> {
  if (Platform.OS !== 'android') return;

  const Notifications = await loadExpoNotificationsModule();
  if (!Notifications) return;

  const importance = settings.pushEnabled
    ? Notifications.AndroidImportance.MAX
    : Notifications.AndroidImportance.MIN;
  const vibrationPattern =
    settings.pushEnabled && settings.vibrationEnabled ? [0, 250, 250, 250] : [];

  for (const type of Object.keys(ANDROID_CHANNEL_IDS) as NotificationType[]) {
    const typeEnabled = settings.types[type] !== false;
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_IDS[type], {
      name: CHANNEL_LABELS[type],
      importance: settings.pushEnabled && typeEnabled ? importance : Notifications.AndroidImportance.MIN,
      vibrationPattern: settings.pushEnabled && settings.vibrationEnabled && typeEnabled
        ? vibrationPattern
        : [],
      enableVibrate: settings.pushEnabled && settings.vibrationEnabled && typeEnabled,
      lightColor: '#6C5CE7',
    });
  }
}
