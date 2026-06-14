// src/services/NotificationService.ts
import DataService from './DataService';
import {
  supportsExpoNotificationsModule,
  supportsRemotePushNotifications,
} from './notifications/expoNotificationsBridge';
import pushTokenService from './notifications/PushTokenService';
import pushDeliveryService from './notifications/PushDeliveryService';
import localNotificationService from './notifications/LocalNotificationService';
import notificationHistoryService from './notifications/NotificationHistoryService';
import staffAlertQueueService from './notifications/StaffAlertQueueService';
import { registerBackgroundNotificationTask } from './notifications/notificationBackgroundTask';
import {
  advanceRequestTexts,
  chatMessageTexts,
  locationWarningTexts,
  newShiftRequestAdminTexts,
  newShiftRequestStaffTexts,
  newSwapRequestTexts,
  requestStatusTexts,
  scheduleChangedTexts,
  scheduleCopiedTexts,
  shiftAddedTexts,
  shiftAutoEndedTexts,
  shiftDeletedTexts,
  shiftEndedTexts,
  shiftRequestDecisionTexts,
  shiftStartedTexts,
  shiftUpdatedTexts,
  swapApprovedAdminTexts,
  swapApprovedPeerTexts,
  swapOfferTexts,
  swapRejectedAdminTexts,
  swapRejectedPeerTexts,
  swapSubmittedTexts,
} from './notifications/notificationTexts';
import type { NotificationRecord, NotificationType } from './notifications/types';

export type { NotificationRecord } from './notifications/types';

class NotificationService {
  private currentUserId: string | undefined;

  setCurrentUserRole(role?: string): void {
    pushTokenService.setCurrentUser(this.currentUserId, role);
    localNotificationService.setCurrentUser(this.currentUserId, role);
  }

  setCurrentUserId(userId?: string): void {
    this.currentUserId = userId;
    pushTokenService.setCurrentUser(userId, undefined);
    localNotificationService.setCurrentUser(userId, undefined);
  }

  async applyUserPreferences(): Promise<void> {
    await localNotificationService.applyUserPreferences(this.currentUserId);
  }

  async initialize(): Promise<void> {
    await localNotificationService.configureForegroundHandler();

    if (!supportsExpoNotificationsModule) {
      if (__DEV__) {
        console.log(
          'Expo Go Android: системные push недоступны — используйте development build. In-app уведомления работают.'
        );
      }
      return;
    }

    if (supportsRemotePushNotifications) {
      await pushTokenService.registerForPushNotificationsAsync(true);
    }

    await localNotificationService.setupNotificationListeners();
    await registerBackgroundNotificationTask();
  }

  async registerPushTokenForUser(userId: string): Promise<void> {
    this.setCurrentUserId(userId);
    await pushTokenService.registerPushTokenForUser(userId);
  }

  async deliverPendingStaffAlerts(userId: string): Promise<void> {
    await staffAlertQueueService.deliverPendingStaffAlerts(userId);
  }

  async sendLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: {
      sound?: boolean;
      delay?: number;
      saveToHistory?: boolean;
      notificationType?: NotificationType;
    }
  ): Promise<void> {
    await localNotificationService.show({
      title,
      body,
      data,
      sound: options?.sound,
      delay: options?.delay,
      saveToHistory: options?.saveToHistory,
      notificationType: options?.notificationType,
      userId: this.currentUserId,
    });
  }

  private async notifyRecipient(params: {
    recipientUserId: string;
    title: string;
    message: string;
    type: NotificationType;
    data: Record<string, unknown>;
    enqueue?: boolean;
    local?: boolean;
  }): Promise<void> {
    const { recipientUserId, title, message, type, data, enqueue = true, local = false } = params;

    await notificationHistoryService.saveToHistory(title, message, type, data, recipientUserId);
    if (enqueue) {
      await staffAlertQueueService.enqueueStaffAlert(recipientUserId, title, message, data);
    }

    if (local || recipientUserId === this.currentUserId) {
      await localNotificationService.show({
        title,
        body: message,
        data,
        notificationType: type,
        saveToHistory: false,
        userId: recipientUserId,
      });
    }

    await pushDeliveryService.sendToUser(recipientUserId, title, message, data);

    DataService.emitChange('notifications');
    DataService.emitChange(`notifications_${recipientUserId}`);
  }

  async notifyShiftAdded(
    employeeName: string,
    date: string,
    time: string,
    pvzName?: string
  ): Promise<void> {
    const { title, message } = shiftAddedTexts(employeeName, date, time, pvzName);
    await this.sendLocalNotification(title, message, { type: 'shift_added', date, time }, {
      notificationType: 'shift',
    });
  }

  async notifyShiftUpdated(
    employeeName: string,
    date: string,
    oldTime: string,
    newTime: string,
    pvzName?: string
  ): Promise<void> {
    const { title, message } = shiftUpdatedTexts(employeeName, date, oldTime, newTime, pvzName);
    await this.sendLocalNotification(
      title,
      message,
      { type: 'shift_updated', date, oldTime, newTime },
      { notificationType: 'shift' }
    );
  }

  async notifyShiftDeleted(
    employeeName: string,
    date: string,
    time: string,
    pvzName?: string
  ): Promise<void> {
    const { title, message } = shiftDeletedTexts(employeeName, date, time, pvzName);
    await this.sendLocalNotification(title, message, { type: 'shift_deleted', date, time }, {
      notificationType: 'shift',
    });
  }

  async notifyScheduleCopied(pvzName: string, fromDate: string, toDate: string): Promise<void> {
    const { title, message } = scheduleCopiedTexts(pvzName, fromDate, toDate);
    await this.sendLocalNotification(
      title,
      message,
      { type: 'schedule_copied', fromDate, toDate },
      { notificationType: 'schedule' }
    );
  }

  async notifyMassScheduleChange(
    pvzName: string,
    affectedEmployees: string[],
    changeType: string
  ): Promise<void> {
    const { title, message } = scheduleChangedTexts(
      pvzName,
      affectedEmployees.length,
      changeType
    );
    await this.sendLocalNotification(
      title,
      message,
      { type: 'schedule_changed', affectedEmployees, changeType },
      { notificationType: 'schedule' }
    );
  }

  async notifyShiftStarted(employeeName: string, pvzName: string): Promise<void> {
    const { title, message } = shiftStartedTexts(employeeName, pvzName);
    await this.sendLocalNotification(title, message, { type: 'shift_started' }, {
      notificationType: 'shift',
    });
  }

  async notifyShiftEnded(
    employeeName: string,
    duration: string,
    earnings: number,
    rateInfo?: string
  ): Promise<void> {
    const { title, message } = shiftEndedTexts(employeeName, duration, earnings, rateInfo);
    await this.sendLocalNotification(
      title,
      message,
      { type: 'shift_ended', duration, earnings },
      { notificationType: 'shift' }
    );
  }

  async notifyAutoEndedShift(employeeName: string, reason: string): Promise<void> {
    const { title, message } = shiftAutoEndedTexts(employeeName, reason);
    await this.sendLocalNotification(
      title,
      message,
      { type: 'shift_auto_ended', reason },
      { notificationType: 'shift' }
    );
  }

  async notifyLeftPvzZone(employeeName: string): Promise<void> {
    const { title, message } = locationWarningTexts(employeeName);
    await this.sendLocalNotification(title, message, { type: 'location_warning' }, {
      notificationType: 'system',
    });
  }

  async notifyRequestStatus(
    requestType: string,
    status: 'approved' | 'rejected'
  ): Promise<void> {
    const { title, message } = requestStatusTexts(requestType, status);
    await this.sendLocalNotification(title, message, { type: 'request_status', status }, {
      notificationType: 'request',
    });
  }

  async notifyShiftRequestDecision(params: {
    recipientUserId: string;
    date: string;
    status: 'approved' | 'rejected';
    pvzName?: string;
  }): Promise<void> {
    const { recipientUserId, date, status, pvzName } = params;
    if (!recipientUserId) return;

    const { title, message } = shiftRequestDecisionTexts(date, status, pvzName);
    const data = {
      type: 'shift_request_status',
      status,
      date,
      screen: 'Requests',
    };

    await this.notifyRecipient({
      recipientUserId,
      title,
      message,
      type: 'request',
      data,
      local: recipientUserId === this.currentUserId,
    });
  }

  async notifyNewShiftRequest(
    adminName: string,
    employeeName: string,
    date: string
  ): Promise<void> {
    const { title, message } = newShiftRequestAdminTexts(adminName, employeeName, date);
    await this.sendLocalNotification(
      title,
      message,
      { type: 'new_request', employeeName, date },
      { notificationType: 'request' }
    );
  }

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

    const { title, message } = newShiftRequestStaffTexts(
      employeeName,
      date,
      startTime,
      endTime,
      pvzName
    );
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
      await this.notifyRecipient({
        recipientUserId: recipient.id,
        title,
        message,
        type: 'request',
        data,
        local: recipient.id === this.currentUserId,
      });
    }
  }

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

    const { title, message } = newSwapRequestTexts(
      fromEmployeeName,
      toEmployeeName,
      fromDate,
      toDate,
      pvzName
    );
    const data = {
      type: 'new_swap_request',
      requestId,
      fromEmployeeId,
      pvzId,
      screen: 'SwapRequests',
    };

    for (const recipient of recipients) {
      if (recipient.id === fromEmployeeId) continue;
      await this.notifyRecipient({
        recipientUserId: recipient.id,
        title,
        message,
        type: 'swap',
        data,
        local: recipient.id === this.currentUserId,
      });
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

    const { title, message } = swapSubmittedTexts(toEmployeeName, fromDate, toDate);
    const data = { type: 'swap_submitted', screen: 'SwapNotifications' };

    await this.notifyRecipient({
      recipientUserId,
      title,
      message,
      type: 'swap',
      data,
      local: recipientUserId === this.currentUserId,
    });
  }

  async notifySwapApprovedByAdmin(
    fromEmployeeId: string,
    toEmployeeId: string,
    fromEmployeeName: string,
    toEmployeeName: string,
    fromDate: string
  ): Promise<void> {
    const { title, message } = swapApprovedAdminTexts(
      fromEmployeeName,
      toEmployeeName,
      fromDate
    );
    const data = { type: 'swap_approved', screen: 'SwapNotifications' };

    for (const recipientUserId of [fromEmployeeId, toEmployeeId]) {
      if (!recipientUserId) continue;
      await this.notifyRecipient({
        recipientUserId,
        title,
        message,
        type: 'swap',
        data,
        local: recipientUserId === this.currentUserId,
      });
    }
  }

  async notifySwapRejectedByAdmin(
    fromEmployeeId: string,
    toEmployeeId: string,
    fromEmployeeName: string,
    toEmployeeName: string
  ): Promise<void> {
    const { title, message } = swapRejectedAdminTexts(fromEmployeeName, toEmployeeName);
    const data = { type: 'swap_rejected', screen: 'SwapNotifications' };

    for (const recipientUserId of [fromEmployeeId, toEmployeeId]) {
      if (!recipientUserId) continue;
      await this.notifyRecipient({
        recipientUserId,
        title,
        message,
        type: 'swap',
        data,
        local: recipientUserId === this.currentUserId,
      });
    }
  }

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

    const { title, message } = advanceRequestTexts(employeeName, amount, pvzName);
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

    await this.notifyRecipient({
      recipientUserId: owner.id,
      title,
      message,
      type: 'request',
      data,
      local: owner.id === this.currentUserId,
    });
  }

  async notifySwapRequestSent(
    toEmployeeName: string,
    fromEmployeeName: string,
    fromDate: string
  ): Promise<void> {
    const { title, message } = swapOfferTexts(fromEmployeeName, toEmployeeName, fromDate);
    await this.sendLocalNotification(
      title,
      message,
      { type: 'swap_request_sent', fromEmployeeName, fromDate },
      { notificationType: 'swap' }
    );
  }

  async notifySwapApproved(
    fromEmployeeName: string,
    toEmployeeName: string,
    date: string
  ): Promise<void> {
    const { title, message } = swapApprovedPeerTexts(fromEmployeeName, toEmployeeName, date);
    await this.sendLocalNotification(title, message, { type: 'swap_approved', date }, {
      notificationType: 'swap',
    });
  }

  async notifySwapRejected(fromEmployeeName: string, toEmployeeName: string): Promise<void> {
    const { title, message } = swapRejectedPeerTexts(fromEmployeeName, toEmployeeName);
    await this.sendLocalNotification(title, message, { type: 'swap_rejected' }, {
      notificationType: 'swap',
    });
  }

  async notifyNewMessage(senderName: string, message: string): Promise<void> {
    const { title, body } = chatMessageTexts(senderName, message);
    await this.sendLocalNotification(
      title,
      body,
      { type: 'new_message', senderName },
      { notificationType: 'system' }
    );
  }

  private async notifyRecipientWithChatSettings(params: {
    recipientUserId: string;
    title: string;
    message: string;
    data: Record<string, unknown>;
    enqueue?: boolean;
    local?: boolean;
  }): Promise<void> {
    const { recipientUserId, title, message, data, enqueue = true, local = false } = params;

    await notificationHistoryService.saveToHistory(title, message, 'system', data, recipientUserId);
    if (enqueue) {
      await staffAlertQueueService.enqueueStaffAlert(recipientUserId, title, message, data);
    }

    if (local || recipientUserId === this.currentUserId) {
      await localNotificationService.show({
        title,
        body: message,
        data,
        notificationType: 'system',
        settingsCategory: 'chat',
        saveToHistory: false,
        userId: recipientUserId,
      });
    }

    await pushDeliveryService.sendToUser(recipientUserId, title, message, data);

    DataService.emitChange('notifications');
    DataService.emitChange(`notifications_${recipientUserId}`);
  }

  async notifyChatMessageForUser(
    recipientUserId: string,
    senderName: string,
    text: string,
    chatId: string,
    chatName?: string
  ): Promise<void> {
    if (!recipientUserId) return;

    const { title, body } = chatMessageTexts(senderName, text);
    const data = {
      type: 'new_message',
      chatId,
      chatName,
      senderName,
      screen: 'Chat',
    };

    await this.notifyRecipientWithChatSettings({
      recipientUserId,
      title,
      message: body,
      data,
      enqueue: false,
      local: recipientUserId === this.currentUserId,
    });
  }

  async notifyChatRecipients(params: {
    recipientUserIds: string[];
    senderId: string;
    senderName: string;
    text: string;
    chatId: string;
    chatName?: string;
  }): Promise<void> {
    const { recipientUserIds, senderId, senderName, text, chatId, chatName } = params;
    const { title, body } = chatMessageTexts(senderName, text);
    const data = {
      type: 'new_message',
      chatId,
      chatName,
      senderName,
      screen: 'Chat',
    };

    for (const recipientId of recipientUserIds) {
      if (!recipientId || recipientId === senderId) continue;
      await this.notifyRecipientWithChatSettings({
        recipientUserId: recipientId,
        title,
        message: body,
        data,
        local: recipientId === this.currentUserId,
      });
    }
  }

  async refreshNotificationsCache(userId?: string): Promise<void> {
    await notificationHistoryService.refreshNotificationsCache(userId);
  }

  async getNotifications(userId?: string): Promise<NotificationRecord[]> {
    return notificationHistoryService.getNotifications(userId);
  }

  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    await notificationHistoryService.markAsRead(notificationId, userId ?? this.currentUserId);
  }

  async markAllAsRead(userId?: string): Promise<void> {
    await notificationHistoryService.markAllAsRead(userId ?? this.currentUserId);
  }

  async clearAllNotifications(userId?: string): Promise<void> {
    await notificationHistoryService.clearAllNotifications(userId ?? this.currentUserId);
  }

  getPushToken(): string {
    return pushTokenService.getToken();
  }

  cleanup(): void {
    localNotificationService.cleanup();
  }
}

export default new NotificationService();
