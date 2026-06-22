import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole } from '../types/user';
import { cleanPhone } from './phoneHelpers';

export const LAST_OWNER_EMAIL_KEY = 'last_owner_email';
export const OTP_PENDING_OWNER_EMAIL_KEY = 'otp_pending_owner_email';

export function normalizeEmail(email: string | undefined | null): string {
  if (email == null || email === '') {
    return '';
  }
  return email
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

/** Ключ для PIN / rate-limit: email владельца или телефон сотрудника. */
export function getPinLoginKey(role: UserRole | null, phone: string, email: string): string {
  if (role === 'owner') {
    return normalizeEmail(email);
  }
  return cleanPhone(phone);
}

/**
 * Суффикс для SecureStore (только [a-zA-Z0-9_*]).
 * Email вида user@mail.ru → user_at_mail_dot_ru
 */
export function toSecureStoreKeySuffix(loginKey: string): string {
  const normalized = loginKey.includes('@') ? normalizeEmail(loginKey) : cleanPhone(loginKey);
  return normalized
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/[^a-zA-Z0-9_*]/g, '_');
}

export function emailsMatch(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

export async function saveLastOwnerEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return;
  await AsyncStorage.setItem(LAST_OWNER_EMAIL_KEY, normalized);
}

export async function clearLastOwnerEmail(): Promise<void> {
  await AsyncStorage.removeItem(LAST_OWNER_EMAIL_KEY);
}

export async function loadLastOwnerEmail(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_OWNER_EMAIL_KEY);
    if (!raw) return null;
    const normalized = normalizeEmail(raw);
    return isValidEmail(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export async function savePendingOtpEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return;
  await AsyncStorage.setItem(OTP_PENDING_OWNER_EMAIL_KEY, normalized);
}

export async function loadPendingOtpEmail(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(OTP_PENDING_OWNER_EMAIL_KEY);
    if (!raw) return null;
    const normalized = normalizeEmail(raw);
    return isValidEmail(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export async function clearPendingOtpEmail(): Promise<void> {
  await AsyncStorage.removeItem(OTP_PENDING_OWNER_EMAIL_KEY);
}
