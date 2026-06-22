import { Platform } from 'react-native';
import {
  loadExpoNotificationsModule,
  supportsExpoNotificationsModule,
} from './expoNotificationsBridge';
import {
  isNotificationTypeEnabled,
  loadStoredNotificationSettings,
  type NotificationTypeSettings,
  type UserRole,
} from '../../utils/notificationSettingsHelpers';
import { ensureAndroidNotificationChannels, channelIdForType } from './androidChannels';
import { navigateFromNotificationData } from '../../navigation/navigationRef';
import notificationHistoryService from './NotificationHistoryService';
import type { NotificationType } from './types';

function resolveNotificationTypeFromData(data?: Record<string, unknown>): NotificationType {
  const explicit = data?.notificationType;
  if (
    explicit === 'shift' ||
    explicit === 'schedule' ||
    explicit === 'request' ||
    explicit === 'swap' ||
    explicit === 'system'
  ) {
    return explicit;
  }
  const raw = typeof data?.type === 'string' ? data.type : '';
  if (raw.includes('swap')) return 'swap';
  if (raw.includes('schedule')) return 'schedule';
  if (raw.includes('shift')) return 'shift';
  if (raw.includes('message')) return 'system';
  if (raw.includes('request') || raw.includes('advance')) return 'request';
  return 'system';
}

export interface LocalNotificationOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: boolean;
  delay?: number;
  saveToHistory?: boolean;
  notificationType?: NotificationType;
  settingsCategory?: keyof NotificationTypeSettings;
  userId?: string;
  role?: UserRole;
}

class LocalNotificationService {
  private notificationListener: { remove: () => void } | null = null;
  private responseListener: { remove: () => void } | null = null;
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

  private async getSettings(userId?: string, role?: UserRole) {
    return loadStoredNotificationSettings(
      userId ?? this.currentUserId,
      role ?? this.currentUserRole
    );
  }

  async configureForegroundHandler(): Promise<void> {
    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const settings = await this.getSettings();
        const show = settings.pushEnabled;
        return {
          shouldShowAlert: show,
          shouldPlaySound: show && settings.soundEnabled,
          shouldSetBadge: show,
          shouldShowBanner: show,
          shouldShowList: show,
        };
      },
    });
  }

  async applyUserPreferences(userId?: string, role?: UserRole): Promise<void> {
    await this.configureForegroundHandler();
    const settings = await this.getSettings(userId, role);
    await ensureAndroidNotificationChannels(settings);
  }

  async show(options: LocalNotificationOptions): Promise<void> {
    const notificationType = options.notificationType || 'system';
    const settings = await this.getSettings(options.userId, options.role);

    if (options.saveToHistory !== false) {
      await notificationHistoryService.saveToHistory(
        options.title,
        options.body,
        notificationType,
        options.data,
        options.userId
      );
    }

    if (!isNotificationTypeEnabled(settings, notificationType, options.settingsCategory)) {
      return;
    }

    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    const playSound = options.sound !== false && settings.soundEnabled;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data || {},
        sound: playSound ? 'default' : undefined,
        vibrate: settings.vibrationEnabled ? [0, 250, 250, 250] : [],
        ...(Platform.OS === 'android'
          ? { channelId: channelIdForType(notificationType) }
          : {}),
      },
      trigger: options.delay
        ? {
            seconds: options.delay,
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          }
        : null,
    });
  }

  async setupNotificationListeners(): Promise<void> {
    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    this.notificationListener?.remove();
    this.responseListener?.remove();

    this.notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      if (data.remotePush === true && this.currentUserId) {
        void notificationHistoryService.savePushNotification({
          title: content.title ?? '',
          message: content.body ?? '',
          type: resolveNotificationTypeFromData(data),
          data,
          userId: this.currentUserId,
        });
      } else {
        void notificationHistoryService.updateBadgeCount(this.currentUserId);
      }
    });

    this.responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      navigateFromNotificationData(data);
    });

    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    if (lastResponse) {
      const data = lastResponse.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      navigateFromNotificationData(data);
    }
  }

  cleanup(): void {
    this.notificationListener?.remove();
    this.responseListener?.remove();
    this.notificationListener = null;
    this.responseListener = null;
  }
}

export default new LocalNotificationService();
