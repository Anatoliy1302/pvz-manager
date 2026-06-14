import * as SecureStore from 'expo-secure-store';
import { safeParseJson } from './safeJson';
import type { NotificationType } from '../services/notifications/types';

export interface NotificationTypeSettings {
  shift: boolean;
  schedule: boolean;
  request: boolean;
  swap: boolean;
  chat: boolean;
  system: boolean;
}

export interface StoredNotificationSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  types: NotificationTypeSettings;
}

export type UserRole = 'owner' | 'admin' | 'employee';

export const DEFAULT_NOTIFICATION_TYPE_SETTINGS: NotificationTypeSettings = {
  shift: true,
  schedule: true,
  request: true,
  swap: true,
  chat: true,
  system: true,
};

export const DEFAULT_NOTIFICATION_SETTINGS: StoredNotificationSettings = {
  pushEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  types: DEFAULT_NOTIFICATION_TYPE_SETTINGS,
};

export function getNotificationSettingsKey(userId?: string, role?: string): string {
  if (userId) {
    return `notification_settings_${userId}`;
  }
  if (role === 'owner') return 'owner_notification_settings';
  if (role === 'admin') return 'admin_notification_settings';
  return 'employee_notification_settings';
}

export async function loadStoredNotificationSettings(
  userId?: string,
  role?: string
): Promise<StoredNotificationSettings> {
  try {
    const userKey = userId ? getNotificationSettingsKey(userId) : undefined;
    if (userKey) {
      const userStored = await SecureStore.getItemAsync(userKey);
      if (userStored) {
        return parseNotificationSettings(safeParseJson<Record<string, unknown>>(userStored, {}));
      }
    }

    const legacyKey = getNotificationSettingsKey(undefined, role);
    const legacyStored = await SecureStore.getItemAsync(legacyKey);
    if (legacyStored) {
      const parsed = parseNotificationSettings(
        safeParseJson<Record<string, unknown>>(legacyStored, {})
      );
      if (userKey) {
        await SecureStore.setItemAsync(userKey, serializeNotificationSettings(parsed));
      }
      return parsed;
    }

    return DEFAULT_NOTIFICATION_SETTINGS;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export function parseNotificationSettings(
  raw: Record<string, unknown> | null | undefined
): StoredNotificationSettings {
  if (!raw) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  const pushEnabled =
    raw.pushEnabled !== false && raw.pushNotifications !== false;

  const typesRaw = (raw.types as Record<string, unknown> | undefined) ?? {};

  return {
    pushEnabled,
    soundEnabled: raw.soundEnabled !== false,
    vibrationEnabled: raw.vibrationEnabled !== false,
    types: {
      shift: typesRaw.shift !== false,
      schedule: typesRaw.schedule !== false,
      request: typesRaw.request !== false,
      swap: typesRaw.swap !== false,
      chat: typesRaw.chat !== false,
      system: typesRaw.system !== false,
    },
  };
}

export function serializeNotificationSettings(
  settings: StoredNotificationSettings
): string {
  return JSON.stringify({
    pushEnabled: settings.pushEnabled,
    soundEnabled: settings.soundEnabled,
    vibrationEnabled: settings.vibrationEnabled,
    types: settings.types,
  });
}

export function isNotificationTypeEnabled(
  settings: StoredNotificationSettings,
  type: NotificationType,
  settingsCategory?: keyof NotificationTypeSettings
): boolean {
  if (!settings.pushEnabled) return false;
  const key = settingsCategory ?? mapNotificationRecordTypeToSettingKey(type);
  return settings.types[key] !== false;
}

export function mapNotificationRecordTypeToSettingKey(
  type: NotificationType
): keyof NotificationTypeSettings {
  return type === 'system' ? 'system' : type;
}
