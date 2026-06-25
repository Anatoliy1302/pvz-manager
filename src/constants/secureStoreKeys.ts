import { buildSecureStoreKey } from '../utils/secureStoreKey';

/** Static SecureStore / StorageService keys — single source of truth. */
export enum SecureStoreKeys {
  user = 'user',
  pvz = 'pvz',
  pvzList = 'pvz_list',
  pvzUsers = 'pvz_users',
  pendingEmployees = 'pending_employees',
  shifts = 'shifts',
  shiftsHistory = 'shifts_history',
  activeShift = 'active_shift',
  allShiftRequests = 'all_shift_requests',
  allInvitations = 'all_invitations',
  notifications = 'notifications',
  onboardingCompleted = 'onboarding_completed',
  appTheme = 'app_theme',
  appLanguage = 'app_language',
  messagesGeneral = 'messages_general',
  supportMessagesLocal = 'support_messages_local',
  ownerNotificationSettings = 'owner_notification_settings',
  adminNotificationSettings = 'admin_notification_settings',
  employeeNotificationSettings = 'employee_notification_settings',
}

export type SecureStoreKeyValue = `${SecureStoreKeys}`;

export const dynamicSecureStoreKey = {
  invitations: (ownerId: string) => buildSecureStoreKey('invitations', ownerId),
  payments: (pvzId: string) => buildSecureStoreKey('payments', pvzId),
  paymentsEmployee: (employeeId: string) => buildSecureStoreKey('payments_employee', employeeId),
  penalties: (id: string) => buildSecureStoreKey('penalties', id),
  balance: (employeeId: string) => buildSecureStoreKey('balance', employeeId),
  shiftRequests: (employeeId: string) => buildSecureStoreKey('shift_requests', employeeId),
  remotePvzId: (localId: string) => buildSecureStoreKey('remote_pvz_id', localId),
  remoteUserId: (localId: string) => buildSecureStoreKey('remote_user_id', localId),
  notificationSettings: (userId: string) => buildSecureStoreKey('notification_settings', userId),
  salaryFormulas: (pvzId: string) => buildSecureStoreKey('salary_formulas', pvzId),
  salarySettings: (pvzId: string) => buildSecureStoreKey('salary_settings', pvzId),
  globalSalarySettings: (pvzId: string) => buildSecureStoreKey('global_salary_settings', pvzId),
  swapRequests: (pvzId: string) => buildSecureStoreKey('swap_requests', pvzId),
  corrections: (employeeId: string) => buildSecureStoreKey('corrections', employeeId),
  overtime: (employeeId: string) => buildSecureStoreKey('overtime', employeeId),
  chats: (userId: string) => buildSecureStoreKey('chats', userId),
  advanceRequests: (pvzId: string) => buildSecureStoreKey('advance_requests', pvzId),
  advanceRequestsEmployee: (employeeId: string) =>
    buildSecureStoreKey('advance_requests_employee', employeeId),
  shiftCalculation: (shiftId: string) => buildSecureStoreKey('shift_calculation', shiftId),
  employeeSalarySettings: (employeeId: string) =>
    buildSecureStoreKey('employee_salary_settings', employeeId),
  migrationBackup: (oldId: string) => buildSecureStoreKey('migration_backup', oldId),
};
