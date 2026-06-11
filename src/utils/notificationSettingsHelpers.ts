import * as SecureStore from 'expo-secure-store';

export interface StoredNotificationSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export type UserRole = 'owner' | 'admin' | 'employee';

export function getNotificationSettingsKey(role?: string): string {
  if (role === 'owner') return 'owner_notification_settings';
  if (role === 'admin') return 'admin_notification_settings';
  return 'employee_notification_settings';
}

export async function loadStoredNotificationSettings(
  role?: string
): Promise<StoredNotificationSettings> {
  try {
    const stored = await SecureStore.getItemAsync(getNotificationSettingsKey(role));
    if (!stored) {
      return {
        pushEnabled: true,
        soundEnabled: true,
        vibrationEnabled: true,
      };
    }
    return parseNotificationSettings(JSON.parse(stored));
  } catch {
    return {
      pushEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
    };
  }
}

export function parseNotificationSettings(
  raw: Record<string, unknown> | null | undefined
): StoredNotificationSettings {
  if (!raw) {
    return {
      pushEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
    };
  }

  const pushEnabled =
    raw.pushEnabled !== false && raw.pushNotifications !== false;

  return {
    pushEnabled,
    soundEnabled: raw.soundEnabled !== false,
    vibrationEnabled: raw.vibrationEnabled !== false,
  };
}

export function serializeNotificationSettings(
  settings: StoredNotificationSettings
): string {
  return JSON.stringify({
    pushEnabled: settings.pushEnabled,
    soundEnabled: settings.soundEnabled,
    vibrationEnabled: settings.vibrationEnabled,
  });
}
