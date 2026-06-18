import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { supabase, getSupabaseProjectHost, getSupabaseAuthStorageKey } from '../../lib/supabase';
import {
  directSendEmailOtp,
  directSendPhoneOtp,
  directVerifyEmailOtp,
  directVerifyPhoneOtp,
  applyDirectSession,
  NetworkError,
  AuthRequestTimeoutError,
  isRetryableFetchError,
  type DirectAuthSession,
} from '../../lib/supabaseAuthDirect';
import { secureStorageAdapter } from '../utils/secureStorageAdapter';
import { withTimeoutReject } from '../utils/withTimeout';
import DataService from './DataService';
import { User, UserRole, EmployeePermissions, defaultPermissions } from '../types/user';
import { normalizeEmail } from '../utils/loginIdentifier';
import { safeParseJson } from '../utils/safeJson';
import { t } from '../i18n';
import { PROFILE_COLUMNS } from './supabase/selectColumns';

/** Код для обхода OTP в demoMode (только dev / eas development). */
export const DEMO_OTP_CODE = '000000';

const DEMO_BYPASS_USER_ID = 'demo-otp-bypass';

/**
 * Режим демо без реальных OTP (только локально и eas development).
 * Включить: EXPO_PUBLIC_DEMO_MODE=true в .env или eas.json → development.
 */
export function isDemoMode(): boolean {
  const extra = Constants.expoConfig?.extra as { demoMode?: boolean } | undefined;
  if (extra?.demoMode === true) {
    return true;
  }
  return process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
}

/** @deprecated Используйте isDemoMode() */
export const DEMO_MODE = isDemoMode();

/**
 * Реальный Supabase Phone OTP (Twilio и др.).
 * Обязателен в production; в dev можно включить EXPO_PUBLIC_DEMO_MODE.
 */
export const USE_SUPABASE_PHONE_OTP =
  process.env.EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP === 'true';

/** Email OTP для регистрации/входа владельца. По умолчанию включён. */
export const USE_SUPABASE_EMAIL_OTP =
  process.env.EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP !== 'false';

export function usesSupabasePhoneOtp(): boolean {
  return USE_SUPABASE_PHONE_OTP;
}

export function usesSupabaseEmailOtp(): boolean {
  return USE_SUPABASE_EMAIL_OTP;
}

/** @deprecated Владелец использует email OTP */
export function canRegisterOwnerWithoutPhoneOtp(): boolean {
  return !USE_SUPABASE_PHONE_OTP;
}

/** Регистрация владельца без email OTP (локальная разработка). */
export function canRegisterOwnerWithoutEmailOtp(): boolean {
  return !USE_SUPABASE_EMAIL_OTP;
}

export function getOtpCodeLength(): number {
  return 6;
}

async function assertNetworkOnline(): Promise<void> {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    throw new Error(t('alerts.network.supabaseUnreachable', { host: getSupabaseProjectHost() }));
  }
}

/** Сессия из последнего успешного OTP в этом запуске (до синхронизации клиента). */
let cachedDirectSession: DirectAuthSession | null = null;

function cacheDirectAuthSession(session: DirectAuthSession): void {
  cachedDirectSession = session;
}

export function clearCachedDirectAuthSession(): void {
  cachedDirectSession = null;
}

/** UUID из кэша OTP (без сети). */
export function getCachedSessionUserId(): string | null {
  return cachedDirectSession?.userId ?? null;
}

/** Access token из клиента / кэша / storage (без setSession). */
export async function getAuthAccessToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {
    // continue
  }
  if (cachedDirectSession?.accessToken) return cachedDirectSession.accessToken;
  const stored = await readStoredAuthSession();
  return stored?.access_token ?? null;
}

/** Verify мог пройти на сервере, а ответ не дошёл — сессия уже в storage. */
async function recoverUserIdAfterVerifyTimeout(): Promise<string | null> {
  if (cachedDirectSession?.userId) {
    return cachedDirectSession.userId;
  }

  const stored = await readStoredAuthSession();
  if (stored?.user?.id) {
    return stored.user.id;
  }

  if (!(await ensureSupabaseClientSession())) {
    return null;
  }

  try {
    const {
      data: { session },
    } = await withTimeoutReject(supabase.auth.getSession(), 6_000, 'session_read_timeout');
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function assertPhoneOtpAvailable(): void {
  if (!USE_SUPABASE_PHONE_OTP) {
    if (DEMO_MODE) {
      throw new Error(t('alerts.auth.demoSmsDisabled'));
    }
    throw new Error(t('alerts.auth.smsNotConfigured'));
  }
}

function assertEmailOtpAvailable(): void {
  if (!USE_SUPABASE_EMAIL_OTP) {
    if (DEMO_MODE) {
      throw new Error(t('alerts.auth.demoEmailDisabled'));
    }
    throw new Error(t('alerts.auth.emailNotConfigured'));
  }
}

let phoneOtpInFlight = false;
let emailOtpInFlight = false;
let emailVerifyInFlight = false;

export interface AuthProfilePayload {
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  pvzId?: string;
  pvzIds?: string[];
  permissionLevel?: 'full' | 'restricted';
  permissions?: EmployeePermissions;
  status?: 'active' | 'pending' | 'blocked';
}

export function isAuthNetworkOrTimeoutError(error: unknown): boolean {
  if (error instanceof NetworkError || error instanceof AuthRequestTimeoutError) {
    return true;
  }
  if (error instanceof Error) {
    return isRetryableFetchError(error);
  }
  return false;
}

export function formatSupabaseAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('phone provider') && lower.includes('disabled')) {
    return t('alerts.auth.phoneProviderDisabled');
  }
  if (lower.includes('error sending confirmation email') || lower.includes('email provider')) {
    return t('alerts.auth.emailProviderDisabled');
  }
  if (lower.includes('failed to send email') || lower.includes('error sending magic link email')) {
    return t('alerts.auth.emailSendFailed');
  }
  if (
    lower.includes('unexpected status code returned from hook') ||
    lower.includes('failed to reach hook') ||
    lower.includes('hook_timeout')
  ) {
    return t('alerts.network.serverUnavailable');
  }
  if (lower.includes('email logins are disabled')) {
    return t('alerts.auth.emailLoginDisabled');
  }
  if (lower.includes('invalid') && lower.includes('expired')) {
    return t('alerts.auth.invalidOtpCode');
  }
  if (lower.includes('otp_expired') || (lower.includes('token has expired') && !lower.includes('invalid'))) {
    return t('alerts.auth.otpExpired');
  }
  if (lower.includes('invalid otp') || lower.includes('invalid token')) {
    return t('alerts.auth.invalidOtpCode');
  }
  if (
    lower.includes('error sending confirmation otp') ||
    lower.includes('error sending sms') ||
    lower.includes('sms send')
  ) {
    return t('alerts.auth.smsSendFailed');
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('too many messages')
  ) {
    return t('alerts.auth.rateLimit');
  }
  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('network_error') ||
    lower.includes('auth_request_timeout') ||
    lower.includes('session_apply_timeout') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('load failed')
  ) {
    return t('alerts.network.serverUnavailable');
  }
  if (lower.includes('aborted')) {
    return t('alerts.network.supabaseUnreachable', { host: getSupabaseProjectHost() });
  }
  return message;
}

/** Локализованное сообщение для UI без технических деталей. */
export function resolveAuthUserMessage(error: unknown, fallbackKey?: string): string {
  if (isAuthNetworkOrTimeoutError(error)) {
    return t('alerts.network.serverUnavailable');
  }
  if (error instanceof Error) {
    return formatSupabaseAuthError(error.message);
  }
  return fallbackKey ? t(fallbackKey) : t('alerts.network.verifyFailed');
}

/** SMTP/NotiSend: слишком много запросов. */
export function isAuthRateLimitError(error: unknown): boolean {
  const message = resolveAuthUserMessage(error);
  return message === t('alerts.auth.rateLimit');
}

export function parseRateLimitWaitMinutes(error: unknown): number {
  const raw = error instanceof Error ? error.message : String(error);
  const match = raw.match(/(\d+)\s*minutes?/i) ?? raw.match(/(\d+)\s*мин/i);
  if (match) {
    const value = Number.parseInt(match[1], 10);
    if (value > 0) return value;
  }
  return 15;
}

/** Сеть оборвалась при отправке — письмо/SMS могло уйти, а могло и нет. */
export function isOtpSendUncertain(error: unknown): boolean {
  return error instanceof AuthRequestTimeoutError || error instanceof NetworkError;
}

/** Письмо/SMS точно ушли, хотя Supabase вернул ошибку hook timeout. */
export function isOtpSendMaybeDelivered(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('hook_timeout') ||
    message.includes('error sending confirmation otp')
  );
}
export function isSupabaseProviderConfigError(error: unknown): boolean {
  if (!DEMO_MODE) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('phone provider') ||
    message.includes('sms provider') ||
    message.includes('signup is disabled') ||
    message.includes('email provider is disabled')
  );
}

function mapProfileRow(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    email: (row.email as string) || '',
    role: row.role as UserRole,
    status: (row.status as User['status']) || 'active',
    pvzId: (row.pvz_id as string) || undefined,
    pvzIds: (row.pvz_ids as string[]) || undefined,
    permissionLevel: (row.permission_level as User['permissionLevel']) || undefined,
    permissions: (row.permissions as EmployeePermissions) || { ...defaultPermissions },
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export async function upsertProfile(userId: string, profile: AuthProfilePayload): Promise<void> {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      name: profile.name,
      phone: profile.phone || '',
      email: profile.email ? normalizeEmail(profile.email) : null,
      role: profile.role,
      pvz_id: profile.pvzId || null,
      pvz_ids: profile.pvzIds || [],
      permission_level: profile.permissionLevel || null,
      permissions: profile.permissions || defaultPermissions,
      status: profile.status || 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchProfileUser(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapProfileRow(data as Record<string, unknown>) : null;
}

/** Отправить SMS-код сотруднику/админу через Supabase Phone OTP. */
export async function sendPhoneOtp(cleanPhone: string): Promise<void> {
  if (DEMO_MODE) {
    console.info('DEMO MODE: skip phone OTP send');
    return;
  }

  assertPhoneOtpAvailable();

  if (phoneOtpInFlight) {
    throw new Error(t('alerts.auth.otpAlreadyInFlight'));
  }

  phoneOtpInFlight = true;
  try {
    await assertNetworkOnline();
    await directSendPhoneOtp(cleanPhone);
  } catch (error: unknown) {
    if (isOtpSendMaybeDelivered(error)) {
      throw error;
    }
    throw new Error(resolveAuthUserMessage(error));
  } finally {
    phoneOtpInFlight = false;
  }
}

/** Подтвердить код из SMS. Создаёт Supabase-сессию. */
export async function verifyPhoneOtp(cleanPhone: string, token: string): Promise<string> {
  if (DEMO_MODE && token === DEMO_OTP_CODE) {
    console.info('DEMO MODE: bypass');
    return DEMO_BYPASS_USER_ID;
  }

  assertPhoneOtpAvailable();

  try {
    const session = await directVerifyPhoneOtp(cleanPhone, token);
    cacheDirectAuthSession(session);
    await applyDirectSession(session);
    void ensureSupabaseClientSession();
    return session.userId;
  } catch (error: unknown) {
    const recoveredUserId = await recoverUserIdAfterVerifyTimeout();
    if (recoveredUserId) {
      return recoveredUserId;
    }
    throw new Error(resolveAuthUserMessage(error));
  }
}

/** Отправить код на email владельца через Supabase Email OTP. */
export async function sendEmailOtp(email: string): Promise<void> {
  if (DEMO_MODE) {
    console.info('DEMO MODE: skip email OTP send');
    return;
  }

  assertEmailOtpAvailable();

  if (emailOtpInFlight) {
    throw new Error(t('alerts.auth.otpAlreadyInFlight'));
  }

  emailOtpInFlight = true;
  try {
    await assertNetworkOnline();
    await directSendEmailOtp(email);
  } catch (error: unknown) {
    if (isOtpSendMaybeDelivered(error)) {
      throw error;
    }
    throw new Error(resolveAuthUserMessage(error));
  } finally {
    emailOtpInFlight = false;
  }
}

/** Результат успешного email OTP — userId + JWT для запросов к Supabase. */
export interface VerifiedOtpSession {
  userId: string;
  accessToken: string;
}

async function recoverOtpSessionAfterVerifyTimeout(): Promise<VerifiedOtpSession | null> {
  const userId = await recoverUserIdAfterVerifyTimeout();
  if (!userId) return null;
  const accessToken = (await getAuthAccessToken()) ?? '';
  if (!accessToken) return null;
  return { userId, accessToken };
}

/** Подтвердить код из email. Создаёт Supabase-сессию владельца. */
export async function verifyEmailOtp(email: string, token: string): Promise<VerifiedOtpSession> {
  if (DEMO_MODE && token === DEMO_OTP_CODE) {
    console.info('DEMO MODE: bypass');
    return { userId: DEMO_BYPASS_USER_ID, accessToken: '' };
  }

  assertEmailOtpAvailable();

  if (emailVerifyInFlight) {
    const recovered = await recoverOtpSessionAfterVerifyTimeout();
    if (recovered) {
      return recovered;
    }
    throw new Error(t('alerts.auth.otpAlreadyInFlight'));
  }

  emailVerifyInFlight = true;
  try {
    const session = await directVerifyEmailOtp(email, token);
    cacheDirectAuthSession(session);
    await applyDirectSession(session);
    void ensureSupabaseClientSession();
    return { userId: session.userId, accessToken: session.accessToken };
  } catch (error: unknown) {
    const recovered = await recoverOtpSessionAfterVerifyTimeout();
    if (recovered) {
      return recovered;
    }
    throw new Error(resolveAuthUserMessage(error));
  } finally {
    emailVerifyInFlight = false;
  }
}

/**
 * Привязать активную Supabase-сессию к профилю приложения.
 * Вызывается после успешного OTP и локального выбора роли/ПВЗ.
 */
export async function linkSupabaseProfile(profile: AuthProfilePayload): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return null;
  }

  await upsertProfile(session.user.id, profile);
  return session.user.id;
}

/** Перенос локального id на UUID Supabase (смены, ПВЗ, pvz_users) с откатом при ошибке. */
export async function migrateLocalUserId(oldId: string, newId: string, role: UserRole): Promise<void> {
  const backupKey = `migration_backup_${oldId}`;
  const storeKeys = ['pvz_users', 'shifts', 'all_shift_requests', 'all_invitations', `invitations_${oldId}`];

  const backup: Record<string, string | null> = {};
  for (const key of storeKeys) {
    backup[key] = await SecureStore.getItemAsync(key);
  }
  await SecureStore.setItemAsync(backupKey, JSON.stringify(backup));

  const rollback = async () => {
    const raw = await SecureStore.getItemAsync(backupKey);
    if (!raw) return;
    const snapshot = safeParseJson<Record<string, string | null>>(raw, {});
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === null) {
        await SecureStore.deleteItemAsync(key);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    }
    await SecureStore.deleteItemAsync(backupKey);
  };

  try {
    const { setUserIdMapping } = await import('../utils/supabaseHelpers');
    await setUserIdMapping(oldId, newId);

    const usersRaw = await SecureStore.getItemAsync('pvz_users');
    if (usersRaw) {
      const users = safeParseJson<User[]>(usersRaw, []);
      const updated = users.map((u) => (u.id === oldId ? { ...u, id: newId } : u));
      await SecureStore.setItemAsync('pvz_users', JSON.stringify(updated));
    }

    if (role === 'owner') {
      const pvzs = await DataService.getPvzs();
      for (const p of pvzs) {
        if (p.ownerId === oldId) {
          await DataService.savePvz({ ...p, ownerId: newId });
        }
      }
    }

    const shiftsRaw = await SecureStore.getItemAsync('shifts');
    if (shiftsRaw) {
      const shifts = safeParseJson<Array<{ employeeId?: string }>>(shiftsRaw, []);
      const updatedShifts = shifts.map((s) =>
        s.employeeId === oldId ? { ...s, employeeId: newId } : s
      );
      await SecureStore.setItemAsync('shifts', JSON.stringify(updatedShifts));
    }

    const shiftRequestsRaw = await SecureStore.getItemAsync('all_shift_requests');
    if (shiftRequestsRaw) {
      const requests = safeParseJson<Array<{ employeeId?: string }>>(shiftRequestsRaw, []);
      const updatedRequests = requests.map((r) =>
        r.employeeId === oldId ? { ...r, employeeId: newId } : r
      );
      await SecureStore.setItemAsync('all_shift_requests', JSON.stringify(updatedRequests));
    }

    const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
    if (allInvitationsRaw) {
      const invitations = safeParseJson<Array<{ invitedBy?: string }>>(allInvitationsRaw, []);
      const updatedInvitations = invitations.map((inv) =>
        inv.invitedBy === oldId ? { ...inv, invitedBy: newId } : inv
      );
      await SecureStore.setItemAsync('all_invitations', JSON.stringify(updatedInvitations));
    }

    const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${oldId}`);
    if (ownerInvitationsRaw) {
      await SecureStore.setItemAsync(`invitations_${newId}`, ownerInvitationsRaw);
      await SecureStore.deleteItemAsync(`invitations_${oldId}`);
    }

    await SecureStore.deleteItemAsync(backupKey);
  } catch (error) {
    await rollback();
    throw error;
  }
}

/** UUID текущего пользователя Supabase Auth (после email/phone OTP). */
export async function getSupabaseSessionUserId(): Promise<string | null> {
  const cached = getCachedSessionUserId();
  if (cached) return cached;

  const stored = await readStoredAuthSession();
  if (stored?.user?.id) return stored.user.id;

  if (!(await ensureSupabaseClientSession())) {
    return null;
  }

  try {
    const {
      data: { session },
    } = await withTimeoutReject(supabase.auth.getSession(), 4_000, 'session_read_timeout');
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Быстрая проверка: есть JWT (без setSession). */
export async function hasSupabaseSession(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return true;
  } catch {
    // continue
  }
  return hasStoredAuthTokens();
}

/** JWT есть в памяти или storage, но клиент может быть ещё не синхронизирован. */
export async function hasStoredAuthTokens(): Promise<boolean> {
  if (cachedDirectSession?.accessToken || cachedDirectSession?.refreshToken) {
    return true;
  }
  const stored = await readStoredAuthSession();
  return Boolean(stored?.access_token || stored?.refresh_token);
}

type StoredAuthSession = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string };
};

async function readStoredAuthSession(): Promise<StoredAuthSession | null> {
  const raw = await secureStorageAdapter.getItem(getSupabaseAuthStorageKey());
  if (!raw) return null;

  const parsed = safeParseJson<StoredAuthSession>(raw, {});
  if (!parsed.access_token && !parsed.refresh_token) return null;
  return parsed;
}

async function applySessionTokens(accessToken: string, refreshToken: string): Promise<boolean> {
  try {
    const { data, error } = await withTimeoutReject(
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      5_000,
      'session_apply_timeout'
    );
    return !error && Boolean(data.session?.access_token);
  } catch {
    return false;
  }
}

let clientSessionRestoreInFlight: Promise<boolean> | null = null;

async function restoreSupabaseClientSession(): Promise<boolean> {
  try {
    const {
      data: { session: activeSession },
    } = await supabase.auth.getSession();
    if (activeSession?.access_token) return true;
  } catch {
    // continue with restore
  }

  if (cachedDirectSession?.accessToken && cachedDirectSession.refreshToken) {
    if (
      await applySessionTokens(cachedDirectSession.accessToken, cachedDirectSession.refreshToken)
    ) {
      return true;
    }
  }

  const stored = await readStoredAuthSession();
  if (!stored) return false;

  if (stored.access_token && stored.refresh_token) {
    if (await applySessionTokens(stored.access_token, stored.refresh_token)) {
      return true;
    }
  }

  if (!stored.refresh_token) return false;

  try {
    const { data, error } = await withTimeoutReject(
      supabase.auth.refreshSession({ refresh_token: stored.refresh_token }),
      8_000,
      'session_refresh_timeout'
    );
    return !error && Boolean(data.session?.access_token);
  } catch {
    return false;
  }
}

/** Синхронизирует JWT в Supabase-клиенте (дедупликация параллельных вызовов). */
export async function ensureSupabaseClientSession(): Promise<boolean> {
  try {
    const {
      data: { session: activeSession },
    } = await supabase.auth.getSession();
    if (activeSession?.access_token) return true;
  } catch {
    // continue with restore
  }

  if (clientSessionRestoreInFlight) {
    return clientSessionRestoreInFlight;
  }

  clientSessionRestoreInFlight = restoreSupabaseClientSession().finally(() => {
    clientSessionRestoreInFlight = null;
  });
  return clientSessionRestoreInFlight;
}

/** setSession в фоне после чтения по REST. */
export function warmSupabaseClientSession(): void {
  void ensureSupabaseClientSession();
}

/**
 * JWT для Edge Functions: клиент → кэш OTP → storage.
 * Не ждёт supabase.auth.setSession (важно для оплаты после входа по PIN).
 */
export async function resolveAuthAccessToken(): Promise<string | null> {
  const existing = await getAuthAccessToken();
  if (existing) {
    warmSupabaseClientSession();
    return existing;
  }

  if (await ensureSupabaseClientSession()) {
    return getAuthAccessToken();
  }

  return null;
}

/** @deprecated Используйте ensureSupabaseClientSession() */
export async function ensureSupabaseSessionFromStorage(): Promise<boolean> {
  const hadStored = await hasStoredAuthTokens();
  const restored = await ensureSupabaseClientSession();
  if (!restored && __DEV__ && hadStored) {
    console.warn('[Auth] JWT в storage, но supabase.auth.setSession не удался');
  }
  return restored;
}

export async function restoreSupabaseSession(): Promise<User | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user?.id) {
      return null;
    }

    return await fetchProfileUser(session.user.id);
  } catch (error) {
    if (__DEV__) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Auth] restoreSupabaseSession:', message);
    }
    return null;
  }
}

export async function signOutSupabase(): Promise<void> {
  clearCachedDirectAuthSession();
  await supabase.auth.signOut();
}

export function subscribeToAuthChanges(onChange: () => void): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) return;
    try {
      onChange();
    } catch (error) {
      if (__DEV__) {
        console.warn('[Auth] onAuthStateChange handler:', error);
      }
    }
  });
  return () => subscription.unsubscribe();
}

export { deleteUserAccount, AccountDeletionError } from './accountDeletionService';
