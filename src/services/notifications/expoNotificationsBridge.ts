import { Platform } from 'react-native';
import { isExpoGo } from '../../utils/expoEnvironment';

/**
 * В Expo Go на Android remote push удалён с SDK 53.
 * Импорт expo-notifications при загрузке вызывает console.error из-за auto-registration.
 */
export const supportsExpoNotificationsModule = !(isExpoGo && Platform.OS === 'android');

export const supportsRemotePushNotifications = supportsExpoNotificationsModule;

type ExpoNotificationsModule = typeof import('expo-notifications');

let notificationsModule: ExpoNotificationsModule | null = null;
let loadPromise: Promise<ExpoNotificationsModule | null> | null = null;

export async function loadExpoNotificationsModule(): Promise<ExpoNotificationsModule | null> {
  if (!supportsExpoNotificationsModule) {
    return null;
  }

  if (notificationsModule) {
    return notificationsModule;
  }

  if (!loadPromise) {
    loadPromise = import('expo-notifications').then((mod) => {
      notificationsModule = mod;
      return mod;
    });
  }

  return loadPromise;
}

export function getExpoNotificationsModuleSync(): ExpoNotificationsModule | null {
  return notificationsModule;
}
