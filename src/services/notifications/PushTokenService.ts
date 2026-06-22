import Constants from 'expo-constants';
import { Platform } from 'react-native';
import StorageService from '../StorageService';
import { hasStoredAccessToken, resolveAuthAccessToken } from '../SupabaseAuthService';
import {
  upsertPushToken,
  fetchPushToken,
  deletePushToken,
} from '../../../lib/pushTokenApi';
import { safeParseJson } from '../../utils/safeJson';
import {
  loadExpoNotificationsModule,
  supportsRemotePushNotifications,
} from './expoNotificationsBridge';
import { ensureAndroidNotificationChannels } from './androidChannels';
import {
  loadStoredNotificationSettings,
  type UserRole,
} from '../../utils/notificationSettingsHelpers';
import { USER_PUSH_TOKENS_KEY } from './types';

type NotificationPermissionResult = {
  granted?: boolean;
  ios?: { status?: number };
};

function notificationsAllowed(
  Notifications: NonNullable<Awaited<ReturnType<typeof loadExpoNotificationsModule>>>,
  permissions: NotificationPermissionResult
): boolean {
  return (
    permissions.granted === true ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
  );
}

class PushTokenService {
  private expoPushToken = '';
  private currentUserId: string | undefined;
  private currentUserRole: UserRole | undefined;

  setCurrentUser(userId?: string, role?: string): void {
    this.currentUserId = userId;
    if (role === 'owner' || role === 'admin' || role === 'employee') {
      this.currentUserRole = role;
      return;
    }
    this.currentUserRole = undefined;
  }

  getToken(): string {
    return this.expoPushToken;
  }

  isOwnToken(token: string): boolean {
    return Boolean(token && this.expoPushToken && token === this.expoPushToken);
  }

  private async getPushTokensMap(): Promise<Record<string, string>> {
    try {
      const raw = await StorageService.getItem(USER_PUSH_TOKENS_KEY);
      return safeParseJson<Record<string, string>>(raw ?? '{}', {});
    } catch {
      return {};
    }
  }

  private async savePushToken(userId: string, token: string): Promise<void> {
    const map = await this.getPushTokensMap();
    map[userId] = token;
    await StorageService.setItem(USER_PUSH_TOKENS_KEY, JSON.stringify(map));
  }

  async syncPushTokenToSupabase(userId: string, token: string): Promise<void> {
    if (!userId || !token || !(await hasStoredAccessToken())) return;
    try {
      const accessToken = await resolveAuthAccessToken();
      if (!accessToken) return;
      await upsertPushToken(token);
    } catch (error) {
      if (__DEV__) {
        console.warn('syncPushTokenToSupabase:', error);
      }
    }
  }

  async invalidatePushToken(token: string): Promise<void> {
    const map = await this.getPushTokensMap();
    const targetEntry = Object.entries(map).find(([, value]) => value === token);
    if (!targetEntry) return;
    await this.invalidatePushTokenForUser(targetEntry[0]);
  }

  async invalidatePushTokenForUser(userId: string): Promise<void> {
    if (!userId) return;

    const map = await this.getPushTokensMap();
    if (map[userId]) {
      delete map[userId];
      await StorageService.setItem(USER_PUSH_TOKENS_KEY, JSON.stringify(map));
    }

    if (await hasStoredAccessToken()) {
      try {
        await deletePushToken(userId);
      } catch (error) {
        console.warn('invalidatePushTokenForUser:', error);
      }
    }
  }

  private async getRemotePushToken(userId: string): Promise<string | null> {
    if (!userId || !(await hasStoredAccessToken())) return null;
    try {
      return await fetchPushToken(userId);
    } catch {
      return null;
    }
  }

  async getRecipientPushToken(userId: string): Promise<string | null> {
    const local = await this.getPushTokensMap();
    if (local[userId]) return local[userId];
    return this.getRemotePushToken(userId);
  }

  async registerForPushNotificationsAsync(forceRefresh = false): Promise<string | null> {
    if (!supportsRemotePushNotifications) return null;

    try {
      const Notifications = await loadExpoNotificationsModule();
      if (!Notifications) return null;

      const settings = await loadStoredNotificationSettings(
        this.currentUserId,
        this.currentUserRole
      );
      await ensureAndroidNotificationChannels(settings);

      const existingPermissions = await Notifications.getPermissionsAsync();
      let allowed = notificationsAllowed(Notifications, existingPermissions);

      if (!allowed) {
        const requestedPermissions = await Notifications.requestPermissionsAsync();
        allowed = notificationsAllowed(Notifications, requestedPermissions);
      }

      if (!allowed) {
        console.log('Разрешение на уведомления не получено');
        return null;
      }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      if (!projectId) {
        console.warn('EAS projectId не найден — push-токен не получен');
        return null;
      }

      const previousToken = this.expoPushToken;
      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
      const newToken = tokenResult.data;

      if (!newToken) return null;

      const tokenChanged = forceRefresh || !previousToken || previousToken !== newToken;
      this.expoPushToken = newToken;

      if (tokenChanged && __DEV__) {
        console.log('Expo Push Token обновлён');
      }

      if (this.currentUserId && tokenChanged) {
        await this.savePushToken(this.currentUserId, newToken);
        await this.syncPushTokenToSupabase(this.currentUserId, newToken);
      }

      return newToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missingFirebase =
        message.includes('FirebaseApp is not initialized') ||
        message.includes('fcm-credentials');

      if (missingFirebase) {
        console.warn(
          'Push-токен недоступен: для Android нужен Firebase (google-services.json). ' +
            'Локальные уведомления работают. ' +
            'https://docs.expo.dev/push-notifications/fcm-credentials/'
        );
      } else {
        console.warn('Ошибка регистрации push-уведомлений:', message);
      }
      return null;
    }
  }

  async registerPushTokenForUser(userId: string): Promise<void> {
    if (!userId || !supportsRemotePushNotifications) return;

    this.currentUserId = userId;

    if (!this.expoPushToken) {
      await this.registerForPushNotificationsAsync(true);
      return;
    }

    const map = await this.getPushTokensMap();
    const storedToken = map[userId];
    if (storedToken !== this.expoPushToken) {
      await this.savePushToken(userId, this.expoPushToken);
      await this.syncPushTokenToSupabase(userId, this.expoPushToken);
    }
  }
}

export default new PushTokenService();
