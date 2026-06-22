import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { getSupabaseProjectHost } from '../../lib/supabase';
import {
  suspendAuthClientNetworkSync as gateSuspendAuthClientNetworkSync,
  resumeAuthClientNetworkSync as gateResumeAuthClientNetworkSync,
  isAuthClientNetworkSyncSuspended,
} from '../../lib/authClientSyncGate';
import {
  sendOtp as apiSendOtp,
  verifyOtp as apiVerifyOtp,
  login as apiLogin,
  setPin as apiSetPin,
  resetPin as apiResetPin,
  sendSmsOtp as apiSendSmsOtp,
  verifySmsOtp as apiVerifySmsOtp,
  pingApiHealth,
  AuthApiError,
  type AuthSession,
  type StaffAuthSession,
} from '../../lib/authApi';
import { acceptStaffInvitationApi } from '../../lib/invitationApi';
import {
  readStoredAccessToken,
  readStoredAuthSession,
  hasStoredAccessToken,
  clearAuthSessionCache,
  cacheMemoryAuthSession,
  persistAuthSession,
  clearAuthSession,
} from '../../lib/authSessionStore';
import { useStorageOnlyAuthClient } from '../../lib/authClientMode';
import { withTimeoutReject } from '../utils/withTimeout';
import DataService from './DataService';
import { User, UserRole, EmployeePermissions, defaultPermissions } from '../types/user';
import { normalizeEmail } from '../utils/loginIdentifier';
import { cleanPhone as normalizeRuPhone } from '../utils/phoneHelpers';
import { safeParseJson } from '../utils/safeJson';
import { t } from '../i18n';
import { PROFILE_COLUMNS } from './supabase/selectColumns';

/** Код для обхода OTP в demoMode (только dev / eas development). */
export const DEMO_OTP_CODE = '000000';

const DEMO_BYPASS_USER_ID = 'demo-otp-bypass';

export class AuthOtpVerifyError extends Error {
  readonly errorCode?: string;
  readonly httpStatus?: number;

  constructor(message: string, errorCode?: string, httpStatus?: number) {
    super(message);
    this.name = 'AuthOtpVerifyError';
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
  }
}

export class NetworkError extends Error {
  constructor(message = 'network_error', cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super('auth_request_timeout');
    this.name = 'AuthRequestTimeoutError';
  }
}

export function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof AuthRequestTimeoutError || error instanceof NetworkError) {
    return true;
  }
  if (error instanceof AuthApiError) {
    return error.httpStatus >= 500;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const lower = error.message.toLowerCase();
  return (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('network error') ||
    lower.includes('auth_request_timeout') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('enotfound') ||
    lower.includes('socket') ||
    lower.includes('load failed') ||
    lower.includes('abort') ||
    lower.includes('connection timeout')
  );
}

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

/** Email OTP (legacy). По умолчанию выключен — владелец входит по паролю. */
export const USE_SUPABASE_EMAIL_OTP =
  process.env.EXPO_PUBLIC_USE_SUPABASE_EMAIL_OTP === 'true';

/** @deprecated SMS OTP всегда через VPS API (lib/authApi). */
export function usesSupabasePhoneOtp(): boolean {
  return false;
}

export function usesSupabaseEmailOtp(): boolean {
  return USE_SUPABASE_EMAIL_OTP;
}

/** Владелец: вход по email + пароль (основной режим). */
export function usesOwnerEmailPassword(): boolean {
  return !USE_SUPABASE_EMAIL_OTP;
}

/** @deprecated Владелец не использует phone OTP */
export function canRegisterOwnerWithoutPhoneOtp(): boolean {
  return true;
}

/** Регистрация владельца без email OTP (локальная разработка). */
export function canRegisterOwnerWithoutEmailOtp(): boolean {
  return !USE_SUPABASE_EMAIL_OTP;
}

export function getOtpCodeLength(): number {
  return 6;
}

/** Длина SMS-кода (SMS Aero Mobile Auth). */
export function getPhoneOtpCodeLength(): number {
  return 4;
}

async function assertNetworkOnline(): Promise<void> {
  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    throw new Error(t('alerts.network.supabaseUnreachable', { host: getSupabaseProjectHost() }));
  }
}

/** Сессия из последнего успешного OTP в этом запуске (до синхронизации клиента). */
let cachedDirectSession: AuthSession | null = null;

function cacheDirectAuthSession(session: AuthSession): void {
  cachedDirectSession = session;
  cacheMemoryAuthSession(session);
}

export function clearCachedDirectAuthSession(): void {
  cachedDirectSession = null;
  clearAuthSessionCache();
}

/** UUID из кэша OTP (без сети). */
export function getCachedSessionUserId(): string | null {
  return cachedDirectSession?.userId ?? null;
}

/** Access token из кэша OTP / storage (без сетевого getSession на RN). */
export async function getAuthAccessToken(): Promise<string | null> {
  if (cachedDirectSession?.accessToken) return cachedDirectSession.accessToken;

  const fromStorage = await readStoredAccessToken();
  if (fromStorage) return fromStorage;

  if (useStorageOnlyAuthClient()) {
    return null;
  }

  return null;
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
  if (stored?.access_token) {
    const userId = parseUserIdFromJwt(stored.access_token);
    if (userId) return userId;
  }

  return null;
}

async function recoverUserIdAfterVerifyWithBackoff(): Promise<string | null> {
  for (const delayMs of [0, 500, 1500, 2500]) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const userId = await recoverUserIdAfterVerifyTimeout();
    if (userId) return userId;
  }
  return null;
}

function assertEmailOtpAvailable(options?: EmailOtpOptions): void {
  if (USE_SUPABASE_EMAIL_OTP || options?.forRegistration || options?.forPinReset) {
    return;
  }
  if (DEMO_MODE) {
    throw new Error(t('alerts.auth.demoEmailDisabled'));
  }
  throw new Error(t('alerts.auth.emailNotConfigured'));
}

let phoneVerifyInFlight = false;
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
  invitationId?: string;
}

export function isAuthNetworkOrTimeoutError(error: unknown): boolean {
  if (error instanceof NetworkError || error instanceof AuthRequestTimeoutError) {
    return true;
  }
  if (error instanceof Error) {
    if (isRetryableFetchError(error)) {
      return true;
    }
    const lower = error.message.toLowerCase();
    return (
      lower.includes('auth_request_timeout') ||
      lower.includes('response_read_failed') ||
      lower.includes('verify_email_timeout') ||
      lower.includes('owner_route_timeout') ||
      lower.includes('session_persist_timeout')
    );
  }
  return false;
}

export function formatSupabaseAuthError(message: string, errorCode?: string): string {
  if (errorCode === 'otp_expired') {
    return t('alerts.auth.otpExpired');
  }
  if (errorCode === 'invalid_otp') {
    return t('alerts.auth.invalidOtpCode');
  }
  if (errorCode === 'no_user') {
    return t('alerts.auth.emailNotFound');
  }
  if (errorCode === 'email_not_configured' || errorCode === 'email_delivery_failed') {
    const lowerDelivery = message.toLowerCase();
    if (
      lowerDelivery.includes('non-local sender') ||
      lowerDelivery.includes('mxs.mail.ru') ||
      lowerDelivery.includes('mail.ru rejected') ||
      lowerDelivery.includes('spf/dkim') ||
      lowerDelivery.includes('delivery_soft_bounced') ||
      lowerDelivery.includes('delivery_hard_bounced')
    ) {
      return t('alerts.network.emailMailRuRejected');
    }
    return t('alerts.network.emailFailed');
  }
  const lowerMsg = message.toLowerCase();
  if (
    lowerMsg.includes('non-local sender') ||
    lowerMsg.includes('mxs.mail.ru') ||
    lowerMsg.includes('delivery_soft_bounced') ||
    lowerMsg.includes('delivery_hard_bounced')
  ) {
    return t('alerts.network.emailMailRuRejected');
  }
  if (errorCode === 'invalid_credentials') {
    return t('alerts.auth.invalidCredentials');
  }
  if (errorCode === 'validation_failed') {
    return t('alerts.validation.invalidEmail');
  }
  const lower = message.toLowerCase();
  if (lower.includes('phone provider') && lower.includes('disabled')) {
    return t('alerts.auth.phoneProviderDisabled');
  }
  if (
    lower.includes('error sending confirmation email') ||
    lower.includes('email provider is disabled') ||
    lower.includes('email provider not enabled')
  ) {
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
    return lower.includes('sms') || lower.includes('phone')
      ? t('alerts.auth.smsSendFailed')
      : t('alerts.network.serverUnavailable');
  }
  if (lower.includes('invalid login credentials')) {
    return t('alerts.auth.invalidCredentials');
  }
  if (lower.includes('user already registered')) {
    return t('alerts.auth.emailAlreadyRegistered');
  }
  if (lower.includes('email logins are disabled')) {
    return t('alerts.auth.emailLoginDisabled');
  }
  if (lower.includes('invalid') && lower.includes('expired')) {
    return t('alerts.auth.invalidOtpCode');
  }
  if (lower.includes('verify response missing session')) {
    return t('alerts.network.verifyFailed');
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
    lower.includes('load failed') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable') ||
    lower.includes('gateway timeout') ||
    /\bhttp 5\d{2}\b/.test(lower)
  ) {
    return t('alerts.network.serverUnavailable');
  }
  if (lower.includes('aborted')) {
    return t('alerts.network.supabaseUnreachable', { host: getSupabaseProjectHost() });
  }
  return message;
}

/** Сообщение «Сервер временно недоступен» (сеть / таймаут verify). */
export function isAuthServerUnavailableError(error: unknown): boolean {
  return resolveAuthUserMessage(error) === t('alerts.network.serverUnavailable');
}

/** Локализованное сообщение для UI без технических деталей. */
export function resolveAuthUserMessage(error: unknown, fallbackKey?: string): string {
  if (error instanceof AuthOtpVerifyError) {
    return formatSupabaseAuthError(error.message, error.errorCode);
  }
  if (error instanceof AuthApiError) {
    return formatSupabaseAuthError(error.message, error.errorCode);
  }
  if (isAuthNetworkOrTimeoutError(error)) {
    return t('alerts.network.serverUnavailable');
  }
  if (error instanceof Error) {
    const localizedAuthErrors = [
      t('alerts.auth.emailNotConfigured'),
      t('alerts.auth.demoEmailDisabled'),
      t('alerts.auth.smsNotConfigured'),
      t('alerts.auth.demoSmsDisabled'),
      t('alerts.auth.otpAlreadyInFlight'),
    ];
    if (localizedAuthErrors.includes(error.message)) {
      return error.message;
    }
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

/** Письмо/SMS могли уйти, хотя Supabase вернул ошибку hook / таймаут. */
export function isOtpSendMaybeDelivered(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('hook_timeout') ||
    message.includes('hook timed out') ||
    message.includes('error sending confirmation otp') ||
    message.includes('error sending sms otp') ||
    message.includes('error sending otp') ||
    message.includes('error sending magic link email') ||
    message.includes('error sending confirmation email') ||
    message.includes('unexpected status code returned from hook') ||
    message.includes('failed to reach hook') ||
    message.includes('failed to send email')
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
  if (__DEV__) {
    console.warn('[Auth] upsertProfile: Supabase removed, profile kept locally only', userId, profile.role);
  }
}

async function upsertProfileViaRest(
  _userId: string,
  _profile: AuthProfilePayload,
  _accessToken: string
): Promise<void> {
  // no-op — data layer migrated off Supabase
}

export async function fetchProfileUser(userId: string): Promise<User | null> {
  const usersRaw = await SecureStore.getItemAsync('pvz_users');
  const users = safeParseJson<User[]>(usersRaw ?? '[]', []);
  return users.find((u) => u.id === userId) ?? null;
}

/** После phone OTP — профиль сотрудника (локально). */
async function ensurePhoneProfileAfterOtp(
  _session: AuthSession,
  _phoneInput: string
): Promise<void> {
  // Phone OTP не поддерживается новым API
}

/** Финализация profiles сотрудника/админа после SMS OTP. */
export async function ensureStaffProfileForLogin(profile: AuthProfilePayload): Promise<boolean> {
  if (!profile.invitationId) return false;
  try {
    await acceptStaffInvitationApi({
      invitationId: profile.invitationId,
      name: profile.name,
      role: profile.role === 'admin' ? 'admin' : 'employee',
      pvzId: profile.pvzId,
    });
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('[Auth] ensureStaffProfileForLogin:', error);
    }
    return false;
  }
}

/** Профиль владельца после OTP. */
export async function ensureOwnerProfileForLogin(
  _session: Pick<AuthSession, 'accessToken' | 'userId'>,
  _email: string,
): Promise<void> {
  // Профиль создаётся локально в ownerOps
}

function isDuplicateProfileError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.includes('23505') || raw.toLowerCase().includes('duplicate');
}

/** Фоновое создание профиля владельца после email OTP — не блокирует навигацию. */
export function scheduleOwnerProfileSync(
  _session: Pick<AuthSession, 'accessToken' | 'userId'>,
  _email: string,
): void {
  // no-op
}

/** Отправить SMS-код сотруднику/админу. */
let phoneOtpPromise: Promise<void> | null = null;

export async function sendPhoneOtp(
  cleanPhone: string,
  role: 'employee' | 'admin' = 'employee'
): Promise<void> {
  if (DEMO_MODE) {
    console.info('DEMO MODE: skip SMS OTP send');
    return;
  }
  if (phoneOtpPromise) {
    return phoneOtpPromise;
  }
  phoneOtpPromise = apiSendSmsOtp(cleanPhone, role).finally(() => {
    phoneOtpPromise = null;
  });
  return phoneOtpPromise;
}

/** Подтвердить код из SMS. */
export async function verifyPhoneOtp(
  cleanPhone: string,
  token: string,
  role: 'employee' | 'admin' = 'employee'
): Promise<string> {
  if (DEMO_MODE && token === DEMO_OTP_CODE) {
    return DEMO_BYPASS_USER_ID;
  }
  if (phoneVerifyInFlight) {
    throw new Error(t('alerts.network.verifyFailed'));
  }
  phoneVerifyInFlight = true;
  try {
    const session = await verifyPhoneOtpSession(cleanPhone, token, role);
    return session.userId;
  } finally {
    phoneVerifyInFlight = false;
  }
}

/** Подтвердить SMS и вернуть сессию с приглашениями. */
export async function verifyPhoneOtpSession(
  cleanPhone: string,
  token: string,
  role: 'employee' | 'admin' = 'employee'
): Promise<StaffAuthSession> {
  if (DEMO_MODE && token === DEMO_OTP_CODE) {
    return {
      userId: DEMO_BYPASS_USER_ID,
      accessToken: 'demo-token',
    };
  }
  const session = await apiVerifySmsOtp(cleanPhone, token, role);
  await persistAuthSession(session);
  return session;
}

/** Прогрев Auth до первого OTP сотрудника. */
export function prefetchEmployeePhoneAuth(): void {
  void pingApiHealth();
}

/** Прогрев Auth до первого входа владельца. */
export function prefetchOwnerEmailAuth(): void {
  void pingApiHealth();
}

export type EmailOtpOptions = {
  forRegistration?: boolean;
  /** Сброс PIN — OTP разрешён даже при входе по паролю/PIN */
  forPinReset?: boolean;
};

/** Отправить код на email владельца. */
export async function sendEmailOtp(
  email: string,
  _options?: EmailOtpOptions
): Promise<void> {
  if (DEMO_MODE) {
    console.info('DEMO MODE: skip email OTP send');
    return;
  }

  if (emailOtpInFlight) {
    throw new Error(t('alerts.auth.otpAlreadyInFlight'));
  }

  emailOtpInFlight = true;
  try {
    await assertNetworkOnline();
    await apiSendOtp(email, {
      purpose: _options?.forPinReset ? 'pin_reset' : undefined,
    });
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

/** Подтвердить код из email. */
export async function verifyEmailOtp(
  email: string,
  token: string,
  _options?: EmailOtpOptions
): Promise<VerifiedOtpSession> {
  if (DEMO_MODE && token === DEMO_OTP_CODE) {
    return { userId: DEMO_BYPASS_USER_ID, accessToken: '' };
  }

  if (emailVerifyInFlight) {
    throw new Error(t('alerts.auth.otpAlreadyInFlight'));
  }

  emailVerifyInFlight = true;
  try {
    void pingApiHealth();
    const session = await apiVerifyOtp(email, token);
    cacheDirectAuthSession(session);
    try {
      await withTimeoutReject(
        persistAuthSession(session, email),
        4_000,
        'persist_session_timeout'
      );
    } catch (persistError) {
      if (__DEV__) {
        console.warn('[Auth] persistAuthSession failed:', persistError);
      }
    }
    return { userId: session.userId, accessToken: session.accessToken };
  } catch (error: unknown) {
    if (error instanceof AuthApiError) {
      throw new AuthOtpVerifyError(error.message, error.errorCode, error.httpStatus);
    }
    throw new Error(resolveAuthUserMessage(error));
  } finally {
    emailVerifyInFlight = false;
  }
}

/** Вход владельца по email и PIN через новый API. */
export async function signInWithEmailPin(
  email: string,
  pin: string
): Promise<VerifiedOtpSession> {
  await assertNetworkOnline();
  const session = await apiLogin(email, pin);
  cacheDirectAuthSession(session);
  await persistAuthSession(session, email);
  return { userId: session.userId, accessToken: session.accessToken };
}

/** Установить PIN на сервере после OTP. */
export async function setOwnerPinOnServer(
  pin: string,
  accessToken?: string | null
): Promise<void> {
  const token = accessToken ?? cachedDirectSession?.accessToken ?? (await getAuthAccessToken());
  if (!token) {
    throw new Error(t('alerts.auth.supabaseNoUserId'));
  }
  await apiSetPin(pin, token);
}

/** Сброс PIN на сервере через OTP. */
export async function resetOwnerPinOnServer(
  email: string,
  code: string,
  pin: string,
  accessToken?: string | null
): Promise<void> {
  const token = accessToken ?? cachedDirectSession?.accessToken ?? (await getAuthAccessToken());
  if (!token) {
    throw new Error(t('alerts.auth.supabaseNoUserId'));
  }
  await apiResetPin(email, code, pin, token);
}

async function persistOwnerEmailAuthSession(
  session: AuthSession,
  email: string
): Promise<void> {
  cacheDirectAuthSession(session);
  try {
    await persistAuthSession(session, email);
  } catch (persistError) {
    if (__DEV__) {
      console.warn('[Auth] persistAuthSession failed:', persistError);
    }
  }
  await ensureOwnerProfileForLogin(session, email);
}

/** @deprecated Используйте signInWithEmailPin */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<VerifiedOtpSession> {
  return signInWithEmailPin(email, password);
}

/** Регистрация владельца — через OTP + set-pin. */
export async function signUpWithEmail(
  email: string,
  _password: string,
  _userData?: OwnerEmailAuthUserData
): Promise<VerifiedOtpSession> {
  throw new Error(t('alerts.auth.emailNotConfigured'));
}

export async function setOwnerPasswordAfterOtp(
  pin: string,
  accessToken?: string | null,
): Promise<void> {
  await setOwnerPinOnServer(pin, accessToken);
}

export async function resetPasswordForEmail(email: string): Promise<void> {
  await sendEmailOtp(email, { forPinReset: true });
}

export type OwnerEmailAuthUserData = {
  name?: string;
};

/**
 * Привязать активную сессию к профилю приложения.
 */
export async function linkSupabaseProfile(profile: AuthProfilePayload): Promise<string | null> {
  const accessToken = await getAuthAccessToken();
  let userId = getCachedSessionUserId();
  if (!userId && accessToken) {
    userId = parseUserIdFromJwt(accessToken);
  }

  if (userId && accessToken) {
    await upsertProfileViaRest(userId, profile, accessToken);
    return userId;
  }

  return userId;
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

/** UUID текущего пользователя (после email OTP / login). */
export async function getSupabaseSessionUserId(): Promise<string | null> {
  const cached = getCachedSessionUserId();
  if (cached) return cached;

  const stored = await readStoredAuthSession();
  if (stored?.user?.id) return stored.user.id;
  if (stored?.access_token) {
    const userId = parseUserIdFromJwt(stored.access_token);
    if (userId) return userId;
  }

  return null;
}

/** Быстрая проверка: есть JWT. */
export async function hasSupabaseSession(): Promise<boolean> {
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

function parseUserIdFromJwt(accessToken: string): string | null {
  try {
    const payloadPart = accessToken.split('.')[1];
    if (!payloadPart) return null;
    const payload = JSON.parse(atob(payloadPart)) as { sub?: string; id?: string };
    return payload.sub ?? payload.id ?? null;
  } catch {
    return null;
  }
}

const SESSION_RESTORE_TIMEOUT_MS = 10_000;
const SESSION_READ_TIMEOUT_MS = 2_500;
const SESSION_PERSIST_TIMEOUT_MS = 8_000;
const PROFILE_REST_TIMEOUT_MS = 5_000;
const STAFF_PROFILE_RPC_TIMEOUT_MS = 10_000;

let clientSessionRestoreInFlight: Promise<boolean> | null = null;

export function suspendAuthClientNetworkSync(): void {
  gateSuspendAuthClientNetworkSync();
}

export function resumeAuthClientNetworkSync(_options?: { warm?: boolean }): void {
  gateResumeAuthClientNetworkSync();
}

async function restoreAuthClientSession(): Promise<boolean> {
  if (cachedDirectSession?.accessToken) return true;
  return hasStoredAccessToken();
}

function scheduleClientSessionRestore(): void {
  if (clientSessionRestoreInFlight) return;
  clientSessionRestoreInFlight = restoreAuthClientSession().finally(() => {
    clientSessionRestoreInFlight = null;
  });
}

async function hasAuthTokensAvailable(): Promise<boolean> {
  if (cachedDirectSession?.accessToken) return true;
  return hasStoredAccessToken();
}

/** Проверка JWT в storage. */
export async function ensureSupabaseClientSession(): Promise<boolean> {
  return hasAuthTokensAvailable();
}

export function warmSupabaseClientSession(): void {
  scheduleClientSessionRestore();
}

/**
 * JWT: кэш OTP → storage.
 */
export async function resolveAuthAccessToken(): Promise<string | null> {
  return getAuthAccessToken();
}

/** @deprecated Используйте ensureSupabaseClientSession() */
export async function ensureSupabaseSessionFromStorage(): Promise<boolean> {
  return ensureSupabaseClientSession();
}

export async function restoreSupabaseSession(): Promise<User | null> {
  const accessToken = await getAuthAccessToken();
  const userId =
    getCachedSessionUserId() ?? (accessToken ? parseUserIdFromJwt(accessToken) : null);
  if (!userId) return null;

  try {
    return await fetchProfileUser(userId);
  } catch (error) {
    if (__DEV__) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Auth] restoreSupabaseSession profile:', message);
    }
    return null;
  }
}

export async function signOutSupabase(): Promise<void> {
  clearCachedDirectAuthSession();
  await clearAuthSession();
}

export function subscribeToAuthChanges(_onChange: () => void): () => void {
  return () => undefined;
}

export { deleteUserAccount, AccountDeletionError } from './accountDeletionService';
