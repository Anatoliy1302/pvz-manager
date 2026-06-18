import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LAST_LOGIN_PROFILE_KEY } from '../../context/auth/lastLoginProfile';
import { LAST_OWNER_EMAIL_KEY } from '../../utils/loginIdentifier';
import { resetUserMemoryStore } from '../../context/auth/userMemoryStore';
import { Pvz, User } from '../../types/user';
import { getGeneralChatId, getMessagesStorageKey } from '../../utils/chatHelpers';
import { clearSupabaseAuthStorage } from '../../utils/secureStorageAdapter';
import { getScheduleAssignmentsKey } from '../../utils/scheduleHelpers';
import { safeParseJson } from '../../utils/safeJson';
import { SUBSCRIPTION_STORAGE_KEY } from '../subscriptionService';
import { readUserChats } from './chatDataService';
import { dataEventBus } from './dataEventBus';
import { Correction, Overtime } from './dataTypes';
import { getShiftsHistory } from './shiftDataService';

/** Ключи настроек приложения — не удаляем при выходе */
const PRESERVED_STORAGE_KEYS = new Set(['onboarding_completed', 'app_theme']);

const STATIC_KEYS = [
  'pvz_list',
  'pvz_users',
  'pending_employees',
  'shifts',
  'shifts_history',
  'active_shift',
  'all_shift_requests',
  'notifications',
  'user',
  'pvz',
  'all_invitations',
  'messages_general',
  SUBSCRIPTION_STORAGE_KEY,
  LAST_LOGIN_PROFILE_KEY,
  LAST_OWNER_EMAIL_KEY,
  'owner_notification_settings',
  'admin_notification_settings',
  'employee_notification_settings',
  'otp_rate_limit_until',
] as const;

async function deleteStorageKey(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore missing SecureStore keys
  }
  await AsyncStorage.removeItem(key).catch(() => undefined);
  await AsyncStorage.removeItem(`${key}__async_overflow`).catch(() => undefined);
}

async function collectIdsFromStorage(): Promise<{ userIds: string[]; pvzIds: string[] }> {
  const userIds = new Set<string>();
  const pvzIds = new Set<string>();

  const usersRaw = await SecureStore.getItemAsync('pvz_users');
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  for (const u of users) {
    if (u.id) userIds.add(u.id);
  }

  const sessionRaw = await SecureStore.getItemAsync('user');
  const sessionUser = safeParseJson<User | null>(sessionRaw, null);
  if (sessionUser?.id) userIds.add(sessionUser.id);

  const pvzListRaw = await SecureStore.getItemAsync('pvz_list');
  const pvzList = safeParseJson<Pvz[]>(pvzListRaw ?? '[]', []);
  for (const p of pvzList) {
    if (p.id) pvzIds.add(p.id);
  }

  const pvzRaw = await SecureStore.getItemAsync('pvz');
  const currentPvz = safeParseJson<Pvz | null>(pvzRaw, null);
  if (currentPvz?.id) pvzIds.add(currentPvz.id);

  return { userIds: [...userIds], pvzIds: [...pvzIds] };
}

function buildDynamicKeys(userIds: string[], pvzIds: string[]): string[] {
  const keys = new Set<string>();

  for (const userId of userIds) {
    keys.add(`invitations_${userId}`);
    keys.add(`chats_${userId}`);
    keys.add(`corrections_${userId}`);
    keys.add(`overtime_${userId}`);
    keys.add(`penalties_${userId}`);
    keys.add(`balance_${userId}`);
    keys.add(`payments_employee_${userId}`);
    keys.add(`shift_requests_${userId}`);
    keys.add(`supabase_user_id_${userId}`);
    keys.add(`notification_settings_${userId}`);
  }

  for (const pvzId of pvzIds) {
    keys.add(getScheduleAssignmentsKey(pvzId));
    keys.add(`swap_requests_${pvzId}`);
    keys.add(`payments_${pvzId}`);
    keys.add(`penalties_${pvzId}`);
    keys.add(`global_salary_settings_${pvzId}`);
    keys.add(`salary_settings_${pvzId}`);
    keys.add(`salary_formulas_${pvzId}`);
    keys.add(`supabase_pvz_id_${pvzId}`);
    keys.add(getMessagesStorageKey(getGeneralChatId(pvzId)));
  }

  return [...keys];
}

async function collectChatMessageKeys(userIds: string[]): Promise<string[]> {
  const keys = new Set<string>();

  for (const userId of userIds) {
    const chats = await readUserChats(userId);
    for (const chat of chats) {
      keys.add(getMessagesStorageKey(chat.id));
    }
  }

  return [...keys];
}

async function clearResidualAsyncStorage(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  for (const key of allKeys) {
    if (PRESERVED_STORAGE_KEYS.has(key)) continue;
    await AsyncStorage.removeItem(key).catch(() => undefined);
  }
}

/** Полная очистка локальных данных пользователя (SecureStore, AsyncStorage, in-memory кеш). */
export async function clearAllData(): Promise<void> {
  const { userIds, pvzIds } = await collectIdsFromStorage();
  const dynamicKeys = buildDynamicKeys(userIds, pvzIds);
  const chatMessageKeys = await collectChatMessageKeys(userIds);

  const keysToDelete = new Set<string>([...STATIC_KEYS, ...dynamicKeys, ...chatMessageKeys]);

  for (const key of keysToDelete) {
    await deleteStorageKey(key);
  }

  await clearSupabaseAuthStorage();
  await clearResidualAsyncStorage();

  resetUserMemoryStore();
  dataEventBus.clear();
}

export async function getCorrections(employeeId: string): Promise<Correction[]> {
  const stored = await SecureStore.getItemAsync(`corrections_${employeeId}`);
  return safeParseJson<Correction[]>(stored ?? '[]', []);
}

export async function addCorrection(employeeId: string, correction: Correction): Promise<void> {
  const corrections = await getCorrections(employeeId);
  corrections.push(correction);
  await SecureStore.setItemAsync(`corrections_${employeeId}`, JSON.stringify(corrections));
  dataEventBus.notify(`corrections_${employeeId}`);
}

export async function getOvertimes(employeeId: string): Promise<Overtime[]> {
  const stored = await SecureStore.getItemAsync(`overtime_${employeeId}`);
  return safeParseJson<Overtime[]>(stored ?? '[]', []);
}

export async function addOvertime(employeeId: string, overtime: Overtime): Promise<void> {
  const overtimes = await getOvertimes(employeeId);
  overtimes.push(overtime);
  await SecureStore.setItemAsync(`overtime_${employeeId}`, JSON.stringify(overtimes));
  dataEventBus.notify(`overtime_${employeeId}`);
}

export async function updateOvertime(
  employeeId: string,
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const overtimes = await getOvertimes(employeeId);
  const index = overtimes.findIndex((o) => o.id === id);

  if (index !== -1) {
    overtimes[index].status = status;
    await SecureStore.setItemAsync(`overtime_${employeeId}`, JSON.stringify(overtimes));
    dataEventBus.notify(`overtime_${employeeId}`);
  }
}

export async function calculateEmployeeStats(employeeId: string, startDate: string, endDate: string) {
  const history = await getShiftsHistory(employeeId);
  const periodShifts = history.filter((s: any) => s.date >= startDate && s.date <= endDate);

  const totalHours = periodShifts.reduce((sum: number, s: any) => sum + (s.duration || 0), 0) / 3600;
  const totalEarned = periodShifts.reduce((sum: number, s: any) => sum + (s.earnings || 0), 0);
  const totalShifts = periodShifts.length;

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    totalEarned,
    totalShifts,
    daysWorked: new Set(periodShifts.map((s: any) => s.date)).size,
  };
}

export async function getItemAsync(key: string): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}