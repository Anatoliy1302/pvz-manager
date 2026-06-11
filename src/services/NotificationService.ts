// src/services/NotificationService.ts
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import StorageService from './StorageService';
import DataService from './DataService';
import { formatDate } from '../utils/dateHelpers';
import { supabase } from '../../lib/supabase';
import { hasSupabaseSession } from './SupabaseAuthService';
import {
  loadExpoNotificationsModule,
  supportsExpoNotificationsModule,
  supportsRemotePushNotifications,
} from './notifications/expoNotificationsBridge';
import {
  fetchNotificationsFromSupabase,
  markAllNotificationsReadInSupabase,
  markNotificationReadInSupabase,
  mergeNotifications,
  upsertNotificationToSupabase,
} from './SupabaseNotificationService';
import {
  loadStoredNotificationSettings,
  type StoredNotificationSettings,
  type UserRole,
} from '../utils/notificationSettingsHelpers';

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: 'shift' | 'schedule' | 'request' | 'swap' | 'system';
  isRead: boolean;
  createdAt: string;
  data?: any;
  recipientUserId?: string;
}

interface StaffAlertQueueItem {
  id: string;
  recipientUserId: string;
  title: string;
  message: string;
  data?: any;
  createdAt: string;
}

const USER_PUSH_TOKENS_KEY = 'user_push_tokens';
const STAFF_ALERT_QUEUE_KEY = 'staff_alert_queue';

class NotificationService {
  private expoPushToken: string = '';
  private notificationListener: any = null;
  private responseListener: any = null;
  private currentUserRole: UserRole | undefined;

  setCurrentUserRole(role?: string): void {
    if (role === 'owner' || role === 'admin' || role === 'employee') {
      this.currentUserRole = role;
      return;
    }
    this.currentUserRole = undefined;
  }

  private async getUserNotificationSettings(): Promise<StoredNotificationSettings> {
    return loadStoredNotificationSettings(this.currentUserRole);
  }

  private async configureForegroundHandler(): Promise<void> {
    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => {
        const settings = await this.getUserNotificationSettings();
        const show = settings.pushEnabled;
        return {
          shouldShowAlert: show,
          shouldPlaySound: show && settings.soundEnabled,
          shouldSetBadge: false,
          shouldShowBanner: show,
          shouldShowList: show,
        };
      },
    });
  }

  async applyUserPreferences(): Promise<void> {
    await this.configureForegroundHandler();
    await this.updateAndroidNotificationChannel();
  }

  private async updateAndroidNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    const settings = await this.getUserNotificationSettings();
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Основной канал',
      importance: settings.pushEnabled
        ? Notifications.AndroidImportance.MAX
        : Notifications.AndroidImportance.MIN,
      vibrationPattern: settings.pushEnabled && settings.vibrationEnabled ? [0, 250, 250, 250] : [],
      enableVibrate: settings.pushEnabled && settings.vibrationEnabled,
      lightColor: '#6C5CE7',
    });
  }

  async initialize(): Promise<void> {
    await this.configureForegroundHandler();

    if (!supportsExpoNotificationsModule) {
      if (__DEV__) {
        console.log(
          'Expo Go Android: системные push недоступны — используйте development build. In-app уведомления работают.'
        );
      }
      return;
    }

    if (supportsRemotePushNotifications) {
      await this.registerForPushNotificationsAsync();
    }

    await this.setupNotificationListeners();
  }

  private async registerForPushNotificationsAsync(): Promise<void> {
    if (!supportsRemotePushNotifications) return;

    try {
      const Notifications = await loadExpoNotificationsModule();
      if (!Notifications) return;

      if (Platform.OS === 'android') {
        await this.updateAndroidNotificationChannel();
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Разрешение на уведомления не получено');
        return;
      }

      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? 
                        Constants?.easConfig?.projectId;
      
      if (projectId) {
        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        this.expoPushToken = token.data;
        console.log('Expo Push Token:', this.expoPushToken);
      }
    } catch (error) {
      console.error('Ошибка регистрации уведомлений:', error);
    }
  }

  private async setupNotificationListeners(): Promise<void> {
    const Notifications = await loadExpoNotificationsModule();
    if (!Notifications) return;

    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('Уведомление получено:', notification);
      }
    );

    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Нажатие на уведомление:', response);
      }
    );
  }

  private async saveToHistory(
    title: string,
    message: string,
    type: NotificationRecord['type'],
    data?: any,
    recipientUserId?: string
  ): Promise<void> {
    try {
      const stored = await StorageService.getItem('notifications');
      const notifications: NotificationRecord[] = stored ? JSON.parse(stored) : [];

      const newNotification: NotificationRecord = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        title,
        message,
        type,
        isRead: false,
        createdAt: new Date().toISOString(),
        data,
        recipientUserId,
      };

      notifications.unshift(newNotification);

      const trimmed = notifications.slice(0, 200);
      await StorageService.setItem('notifications', JSON.stringify(trimmed));

      if (recipientUserId && (await hasSupabaseSession())) {
        await upsertNotificationToSupabase(newNotification, recipientUserId);
      }
    } catch (error) {
      console.error('Ошибка сохранения уведомления:', error);
    }
  }

  private async getPushTokensMap(): Promise<Record<string, string>> {
    try {
      const raw = await StorageService.getItem(USER_PUSH_TOKENS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private async savePushToken(userId: string, token: string): Promise<void> {
    const map = await this.getPushTokensMap();
    map[userId] = token;
    await StorageService.setItem(USER_PUSH_TOKENS_KEY, JSON.stringify(map));
  }

  private async syncPushTokenToSupabase(userId: string, token: string): Promise<void> {
    if (!userId || !token || !(await hasSupabaseSession())) return;
    try {
      const { error } = await supabase.from('user_push_tokens').upsert(
        {
          user_id: userId,
          expo_push_token: token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (error) {
        console.warn('syncPushTokenToSupabase:', error.message);
      }
    } catch (error) {
      console.warn('syncPushTokenToSupabase:', error);
    }
  }

  private async getRemotePushToken(userId: string): Promise<string | null> {
    if (!userId || !(await hasSupabaseSession())) return null;
    try {
      const { data, error } = await supabase
        .from('user_push_tokens')
        .select('expo_push_token')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        console.warn('getRemotePushToken:', error.message);
        return null;
      }
      return data?.expo_push_token || null;
    } catch {
      return null;
    }
  }

  private async getRecipientPushToken(userId: string): Promise<string | null> {
    const local = await this.getPushTokensMap();
    if (local[userId]) return local[userId];
    return this.getRemotePushToken(userId);
  }

  async registerPushTokenForUser(userId: string): Promise<void> {
    if (!userId || !supportsRemotePushNotifications) return;
    if (!this.expoPushToken) {
      await this.registerForPushNotificationsAsync();
    }
    if (this.expoPushToken) {
      await this.savePushToken(userId, this.expoPushToken);
      await this.syncPushTokenToSupabase(userId, this.expoPushToken);
    }
  }

  private async sendExpoPush(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!token || !token.startsWith('ExponentPushToken')) return;

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          title,
          body,
          data: data || {},
          sound: 'default',
          priority: 'high',
        }),
      });
    } catch (error) {
      console.warn('Expo push не отправлен:', error);
    }
  }

  private async enqueueStaffAlert(
    recipientUserId: string,
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      const raw = await StorageService.getItem(STAFF_ALERT_QUEUE_KEY);
      const queue: StaffAlertQueueItem[] = raw ? JSON.parse(raw) : [];
      queue.push({
        id: Date.now().toString(),
        recipientUserId,
        title,
        message,
        data,
        createdAt: new Date().toISOString(),
      });
      await StorageService.setItem(STAFF_ALERT_QUEUE_KEY, JSON.stringify(queue.slice(-100)));
    } catch (error) {
      console.error('Ошибка очереди уведомлений:', error);
    }
  }

  async deliverPendingStaffAlerts(userId: string): Promise<void> {
    if (!userId) return;
    try {
      const raw = await StorageService.getItem(STAFF_ALERT_QUEUE_KEY);
      const queue: StaffAlertQueueItem[] = raw ? JSON.parse(raw) : [];
      const mine = queue.filter((q) => q.recipientUserId === userId);
      if (mine.length === 0) return;

      const rest = queue.filter((q) => q.recipientUserId !== userId);
      await StorageService.setItem(STAFF_ALERT_QUEUE_KEY, JSON.stringify(rest));

      for (const alert of mine) {
        await this.saveToHistory(alert.title, alert.message, 'request', alert.data, userId);
        await this.sendLocalNotification(alert.title, alert.message, alert.data, {
          notificationType: 'request',
          saveToHistory: false,
        });
      }
    } catch (error) {
      console.error('Ошибка доставки очереди:', error);
    }
  }

  async sendLocalNotification(
    title: string, 
    body: string, 
    data?: any,
    options?: {
      sound?: boolean;
      delay?: number;
      saveToHistory?: boolean;
      notificationType?: NotificationRecord['type'];
    }
  ): Promise<void> {
    try {
      if (options?.saveToHistory !== false) {
        await this.saveToHistory(
          title,
          body,
          options?.notificationType || 'system',
          data
        );
      }

      const settings = await this.getUserNotificationSettings();
      if (!settings.pushEnabled) return;

      const Notifications = await loadExpoNotificationsModule();
      if (!Notifications) return;

      const playSound = options?.sound !== false && settings.soundEnabled;
      const notificationContent = {
        title,
        body,
        data: data || {},
        sound: playSound ? 'default' : undefined,
        vibrate: settings.vibrationEnabled ? [0, 250, 250, 250] : [],
      };

      await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: options?.delay
          ? {
              seconds: options.delay,
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            }
          : null,
      });
    } catch (error) {
      console.error('Ошибка отправки уведомления:', error);
    }
  }

  async notifyShiftAdded(employeeName: string, date: string, time: string, pvzName?: string): Promise<void> {
    const formattedDate = new Date(date).toLocaleDateString('ru-RU');
    await this.sendLocalNotification(
      '📅 Новая смена в расписании',
      `${employeeName}, вам добавлена смена на ${formattedDate} (${time}) в ПВЗ "${pvzName || ''}"`,
      { type: 'shift_added', date, time },
      { notificationType: 'shift' }
    );
  }

  async notifyShiftUpdated(employeeName: string, date: string, oldTime: string, newTime: string, pvzName?: string): Promise<void> {
    const formattedDate = new Date(date).toLocaleDateString('ru-RU');
    await this.sendLocalNotification(
      '📅 Смена изменена',
      `${employeeName}, ваша смена на ${formattedDate} изменена: ${oldTime} → ${newTime} в ПВЗ "${pvzName || ''}"`,
      { type: 'shift_updated', date, oldTime, newTime },
      { notificationType: 'shift' }
    );
  }

  async notifyShiftDeleted(employeeName: string, date: string, time: string, pvzName?: string): Promise<void> {
    const formattedDate = new Date(date).toLocaleDateString('ru-RU');
    await this.sendLocalNotification(
      '📅 Смена удалена',
      `${employeeName}, ваша смена на ${formattedDate} (${time}) в ПВЗ "${pvzName || ''}" была удалена`,
      { type: 'shift_deleted', date, time },
      { notificationType: 'shift' }
    );
  }

  async notifyScheduleCopied(pvzName: string, fromDate: string, toDate: string): Promise<void> {
    await this.sendLocalNotification(
      '📅 Расписание скопировано',
      `Расписание ПВЗ "${pvzName}" скопировано с ${fromDate} на ${toDate}`,
      { type: 'schedule_copied', fromDate, toDate },
      { notificationType: 'schedule' }
    );
  }

  async notifyMassScheduleChange(pvzName: string, affectedEmployees: string[], changeType: string): Promise<void> {
    await this.sendLocalNotification(
      '📅 Изменения в расписании',
      `В расписании ПВЗ "${pvzName}" произошли изменения: ${changeType}. Затронуто сотрудников: ${affectedEmployees.length}`,
      { type: 'schedule_changed', affectedEmployees, changeType },
      { notificationType: 'schedule' }
    );
  }

  async notifyShiftStarted(employeeName: string, pvzName: string): Promise<void> {
    await this.sendLocalNotification(
      '✅ Смена началась',
      `${employeeName}, вы начали смену в ${pvzName}`,
      { type: 'shift_started' },
      { notificationType: 'shift' }
    );
  }

  async notifyShiftEnded(employeeName: string, duration: string, earnings: number, rateInfo?: string): Promise<void> {
    await this.sendLocalNotification(
      '✅ Смена завершена',
      `${employeeName}, вы отработали ${duration} и заработали ${earnings} ₽${rateInfo ? ` (${rateInfo})` : ''}`,
      { type: 'shift_ended', duration, earnings },
      { notificationType: 'shift' }
    );
  }

  async notifyAutoEndedShift(employeeName: string, reason: string): Promise<void> {
    await this.sendLocalNotification(
      '⚠️ Смена автоматически завершена',
      `${employeeName}, смена завершена автоматически. Причина: ${reason}`,
      { type: 'shift_auto_ended', reason },
      { notificationType: 'shift' }
    );
  }

  async notifyLeftPvzZone(employeeName: string): Promise<void> {
    await this.sendLocalNotification(
      '⚠️ Внимание!',
      `${employeeName}, вы покинули зону ПВЗ. Вернитесь, иначе смена завершится автоматически.`,
      { type: 'location_warning' },
      { notificationType: 'system' }
    );
  }

  async notifyRequestStatus(requestType: string, status: 'approved' | 'rejected'): Promise<void> {
    const statusText = status === 'approved' ? 'одобрена' : 'отклонена';
    await this.sendLocalNotification(
      status === 'approved' ? '✅ Заявка одобрена' : '❌ Заявка отклонена',
      `Ваша заявка на ${requestType} ${statusText}`,
      { type: 'request_status', status },
      { notificationType: 'request' }
    );
  }

  /** Уведомляет сотрудника о решении по заявке на смену */
  async notifyShiftRequestDecision(params: {
    recipientUserId: string;
    date: string;
    status: 'approved' | 'rejected';
    pvzName?: string;
  }): Promise<void> {
    const { recipientUserId, date, status, pvzName } = params;
    if (!recipientUserId) return;

    const dateLabel = formatDate(date, 'dayMonth');
    const title = status === 'approved' ? '✅ Заявка одобрена' : '❌ Заявка отклонена';
    const message =
      status === 'approved'
        ? `Ваша заявка на смену ${dateLabel} одобрена${pvzName ? ` · ${pvzName}` : ''}`
        : `Ваша заявка на смену ${dateLabel} отклонена`;
    const data = {
      type: 'shift_request_status',
      status,
      date,
      screen: 'Requests',
    };

    await this.saveToHistory(title, message, 'request', data, recipientUserId);
    await this.enqueueStaffAlert(recipientUserId, title, message, data);

    const token = await this.getRecipientPushToken(recipientUserId);
    if (token) {
      await this.sendExpoPush(token, title, message, data);
    }

    DataService.emitChange('notifications');
    DataService.emitChange(`notifications_${recipientUserId}`);
  }

  async notifyNewShiftRequest(adminName: string, employeeName: string, date: string): Promise<void> {
    const formattedDate = formatDate(date, 'dayMonth');
    await this.sendLocalNotification(
      '📝 Новая заявка на смену',
      `${adminName}, сотрудник ${employeeName} подал заявку на смену ${formattedDate}`,
      { type: 'new_request', employeeName, date },
      { notificationType: 'request' }
    );
  }

  /** Уведомляет владельца и админов ПВЗ о новой заявке на смену */
  async notifyStaffNewShiftRequest(params: {
    pvzId?: string;
    pvzName?: string;
    employeeId: string;
    employeeName: string;
    date: string;
    startTime: string;
    endTime: string;
    requestId: string;
  }): Promise<void> {
    const { pvzId, pvzName, employeeId, employeeName, date, startTime, endTime, requestId } =
      params;
    if (!pvzId) return;

    const recipients = await DataService.getShiftRequestNotifyRecipients(pvzId);
    if (recipients.length === 0) return;

    const dateLabel = formatDate(date, 'dayMonth');
    const title = '📝 Новая заявка на смену';
    const message = `${employeeName} подал(а) заявку на ${dateLabel}, ${startTime}–${endTime}${
      pvzName ? ` · ${pvzName}` : ''
    }`;
    const data = {
      type: 'new_shift_request',
      requestId,
      employeeId,
      employeeName,
      date,
      startTime,
      endTime,
      pvzId,
      screen: 'ShiftRequests',
    };

    for (const recipient of recipients) {
      if (recipient.id === employeeId) continue;

      await this.saveToHistory(title, message, 'request', data, recipient.id);
      await this.enqueueStaffAlert(recipient.id, title, message, data);

      const token = await this.getRecipientPushToken(recipient.id);
      if (token) {
        await this.sendExpoPush(token, title, message, data);
      }
    }
  }

  /** Уведомляет владельца и админов ПВЗ о новой заявке на обмен смен */
  async notifyStaffNewSwapRequest(params: {
    pvzId: string;
    pvzName?: string;
    fromEmployeeId: string;
    fromEmployeeName: string;
    toEmployeeName: string;
    fromDate: string;
    toDate: string;
    requestId: string;
  }): Promise<void> {
    const {
      pvzId,
      pvzName,
      fromEmployeeId,
      fromEmployeeName,
      toEmployeeName,
      fromDate,
      toDate,
      requestId,
    } = params;

    const recipients = await DataService.getShiftRequestNotifyRecipients(pvzId);
    if (recipients.length === 0) return;

    const fromLabel = formatDate(fromDate, 'dayMonth');
    const toLabel = formatDate(toDate, 'dayMonth');
    const title = '🔄 Новая заявка на обмен';
    const message = `${fromEmployeeName} ↔ ${toEmployeeName}: ${fromLabel} / ${toLabel}${
      pvzName ? ` · ${pvzName}` : ''
    }`;
    const data = {
      type: 'new_swap_request',
      requestId,
      fromEmployeeId,
      pvzId,
      screen: 'SwapRequests',
    };

    for (const recipient of recipients) {
      if (recipient.id === fromEmployeeId) continue;

      await this.saveToHistory(title, message, 'swap', data, recipient.id);
      await this.enqueueStaffAlert(recipient.id, title, message, data);

      const token = await this.getRecipientPushToken(recipient.id);
      if (token) {
        await this.sendExpoPush(token, title, message, data);
      }
    }
  }

  async notifySwapSubmittedToEmployee(params: {
    recipientUserId: string;
    toEmployeeName: string;
    fromDate: string;
    toDate: string;
  }): Promise<void> {
    const { recipientUserId, toEmployeeName, fromDate, toDate } = params;
    if (!recipientUserId) return;

    const title = '🔄 Заявка на обмен отправлена';
    const message = `Обмен с ${toEmployeeName} (${formatDate(fromDate, 'dayMonth')} ↔ ${formatDate(toDate, 'dayMonth')}) передан администратору`;
    const data = { type: 'swap_submitted', screen: 'SwapNotifications' };

    await this.saveToHistory(title, message, 'swap', data, recipientUserId);
    await this.enqueueStaffAlert(recipientUserId, title, message, data);

    const token = await this.getRecipientPushToken(recipientUserId);
    if (token) {
      await this.sendExpoPush(token, title, message, data);
    }
  }

  async notifySwapApprovedByAdmin(
    fromEmployeeId: string,
    toEmployeeId: string,
    fromEmployeeName: string,
    toEmployeeName: string,
    fromDate: string
  ): Promise<void> {
    const dateLabel = formatDate(fromDate, 'dayMonth');
    const title = '✅ Обмен смен одобрен';
    const message = `Администратор одобрил обмен ${fromEmployeeName} ↔ ${toEmployeeName} (${dateLabel})`;
    const data = { type: 'swap_approved', screen: 'SwapNotifications' };

    for (const recipientUserId of [fromEmployeeId, toEmployeeId]) {
      if (!recipientUserId) continue;
      await this.saveToHistory(title, message, 'swap', data, recipientUserId);
      await this.enqueueStaffAlert(recipientUserId, title, message, data);
      const token = await this.getRecipientPushToken(recipientUserId);
      if (token) {
        await this.sendExpoPush(token, title, message, data);
      }
    }
  }

  async notifySwapRejectedByAdmin(
    fromEmployeeId: string,
    toEmployeeId: string,
    fromEmployeeName: string,
    toEmployeeName: string
  ): Promise<void> {
    const title = '❌ Обмен смен отклонён';
    const message = `Администратор отклонил обмен ${fromEmployeeName} ↔ ${toEmployeeName}`;
    const data = { type: 'swap_rejected', screen: 'SwapNotifications' };

    for (const recipientUserId of [fromEmployeeId, toEmployeeId]) {
      if (!recipientUserId) continue;
      await this.saveToHistory(title, message, 'swap', data, recipientUserId);
      await this.enqueueStaffAlert(recipientUserId, title, message, data);
      const token = await this.getRecipientPushToken(recipientUserId);
      if (token) {
        await this.sendExpoPush(token, title, message, data);
      }
    }
  }

  /** Уведомляет владельца ПВЗ о новом запросе на аванс */
  async notifyStaffNewAdvanceRequest(params: {
    pvzId: string;
    pvzName?: string;
    employeeId: string;
    employeeName: string;
    amount: number;
    requestId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<void> {
    const { pvzId, pvzName, employeeId, employeeName, amount, requestId, periodStart, periodEnd } =
      params;

    const pvz = await DataService.getPvzById(pvzId);
    const users = await DataService.getUsers();
    const owner = pvz?.ownerId
      ? users.find((u) => u.id === pvz.ownerId && u.status === 'active')
      : undefined;

    if (!owner || owner.id === employeeId) return;

    const title = '💰 Запрос на аванс';
    const message = `${employeeName} запросил(а) аванс ${amount.toLocaleString('ru-RU')} ₽${
      pvzName ? ` · ${pvzName}` : ''
    }`;
    const data = {
      type: 'new_advance_request',
      requestId,
      employeeId,
      employeeName,
      amount,
      periodStart,
      periodEnd,
      pvzId,
      screen: 'AdvanceRequests',
    };

    await this.saveToHistory(title, message, 'request', data, owner.id);
    await this.enqueueStaffAlert(owner.id, title, message, data);

    const token = await this.getRecipientPushToken(owner.id);
    if (token) {
      await this.sendExpoPush(token, title, message, data);
    }
  }

  async notifySwapRequestSent(toEmployeeName: string, fromEmployeeName: string, fromDate: string): Promise<void> {
    const formattedDate = new Date(fromDate).toLocaleDateString('ru-RU');
    await this.sendLocalNotification(
      '🔄 Предложение обмена сменами',
      `${toEmployeeName}, ${fromEmployeeName} предлагает обменяться сменами (${formattedDate})`,
      { type: 'swap_request_sent', fromEmployeeName, fromDate },
      { notificationType: 'swap' }
    );
  }

  async notifySwapApproved(fromEmployeeName: string, toEmployeeName: string, date: string): Promise<void> {
    const formattedDate = new Date(date).toLocaleDateString('ru-RU');
    await this.sendLocalNotification(
      '✅ Обмен смен подтверждён',
      `${fromEmployeeName}, ${toEmployeeName} подтвердил(а) обмен сменами на ${formattedDate}`,
      { type: 'swap_approved', date },
      { notificationType: 'swap' }
    );
  }

  async notifySwapRejected(fromEmployeeName: string, toEmployeeName: string): Promise<void> {
    await this.sendLocalNotification(
      '❌ Обмен смен отклонён',
      `${fromEmployeeName}, ${toEmployeeName} отклонил(а) предложение обмена сменами`,
      { type: 'swap_rejected' },
      { notificationType: 'swap' }
    );
  }

  async notifyNewMessage(senderName: string, message: string): Promise<void> {
    await this.sendLocalNotification(
      `💬 Новое сообщение от ${senderName}`,
      message.length > 50 ? message.slice(0, 50) + '...' : message,
      { type: 'new_message', senderName },
      { notificationType: 'system' }
    );
  }

  /** Push + история для одного получателя (входящее на этом устройстве) */
  async notifyChatMessageForUser(
    recipientUserId: string,
    senderName: string,
    text: string,
    chatId: string,
    chatName?: string
  ): Promise<void> {
    if (!recipientUserId) return;

    const title = `💬 ${senderName}`;
    const body = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const data = {
      type: 'new_message',
      chatId,
      chatName,
      senderName,
      screen: 'Chat',
    };

    await this.saveToHistory(title, body, 'system', data, recipientUserId);
    await this.sendLocalNotification(title, body, data, {
      notificationType: 'system',
      saveToHistory: false,
    });

    const token = await this.getRecipientPushToken(recipientUserId);
    if (token) {
      await this.sendExpoPush(token, title, body, data);
    }
  }

  /** Уведомить получателей при отправке сообщения */
  async notifyChatRecipients(params: {
    recipientUserIds: string[];
    senderId: string;
    senderName: string;
    text: string;
    chatId: string;
    chatName?: string;
  }): Promise<void> {
    const { recipientUserIds, senderId, senderName, text, chatId, chatName } = params;
    const title = `💬 ${senderName}`;
    const body = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const data = {
      type: 'new_message',
      chatId,
      chatName,
      senderName,
      screen: 'Chat',
    };

    for (const recipientId of recipientUserIds) {
      if (!recipientId || recipientId === senderId) continue;

      await this.saveToHistory(title, body, 'system', data, recipientId);
      await this.enqueueStaffAlert(recipientId, title, body, data);

      const token = await this.getRecipientPushToken(recipientId);
      if (token) {
        await this.sendExpoPush(token, title, body, data);
      }
    }
  }

  async refreshNotificationsCache(userId?: string): Promise<void> {
    const stored = await StorageService.getItem('notifications');
    let all: NotificationRecord[] = stored ? JSON.parse(stored) : [];
    const remote = await fetchNotificationsFromSupabase();

    if (remote) {
      all = mergeNotifications(all, remote);
      await StorageService.setItem('notifications', JSON.stringify(all));
    }

    DataService.emitChange('notifications');
    if (userId) {
      DataService.emitChange(`notifications_${userId}`);
    }
  }

  async getNotifications(userId?: string): Promise<NotificationRecord[]> {
    try {
      const stored = await StorageService.getItem('notifications');
      let all: NotificationRecord[] = stored ? JSON.parse(stored) : [];

      const remote = await fetchNotificationsFromSupabase();
      if (remote) {
        all = mergeNotifications(all, remote);
        await StorageService.setItem('notifications', JSON.stringify(all));
      }

      if (!userId) return all;
      return all.filter(
        (n) => !n.recipientUserId || n.recipientUserId === userId
      );
    } catch (error) {
      console.error('Ошибка загрузки уведомлений:', error);
      return [];
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      const stored = await StorageService.getItem('notifications');
      const notifications: NotificationRecord[] = stored ? JSON.parse(stored) : [];
      const updated = notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      );
      await StorageService.setItem('notifications', JSON.stringify(updated));
      await markNotificationReadInSupabase(notificationId);
    } catch (error) {
      console.error('Ошибка отметки уведомления:', error);
    }
  }

  async markAllAsRead(userId?: string): Promise<void> {
    try {
      const stored = await StorageService.getItem('notifications');
      const notifications: NotificationRecord[] = stored ? JSON.parse(stored) : [];
      const updated = notifications.map((n) => {
        if (userId && n.recipientUserId && n.recipientUserId !== userId) {
          return n;
        }
        return { ...n, isRead: true };
      });
      await StorageService.setItem('notifications', JSON.stringify(updated));
      if (userId) {
        await markAllNotificationsReadInSupabase();
      }
    } catch (error) {
      console.error('Ошибка отметки уведомлений:', error);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      await StorageService.deleteItem('notifications');
    } catch (error) {
      console.error('Ошибка очистки уведомлений:', error);
    }
  }

  getPushToken(): string {
    return this.expoPushToken;
  }

  cleanup(): void {
    this.notificationListener?.remove();
    this.responseListener?.remove();
  }
}

export default new NotificationService();