import { normalizeEmail } from '../src/utils/loginIdentifier';
import { toE164Phone } from '../src/utils/phoneHelpers';
import { secureStorageAdapter } from '../src/utils/secureStorageAdapter';
import { clearStoredAccessTokenCache } from './authStorageSession';
import {
  requireExpoPublicEnv,
  isValidSupabasePublishableKey,
} from './expoPublicEnv';
import { enqueueAuthFetch } from './authFetchQueue';
import { fetchWithRaceTimeout, FetchRaceTimeoutError } from './fetchWithRaceTimeout';

const AUTH_FETCH_TIMEOUT_MS = 15_000;
/** Verify OTP — очередь send→verify, без AbortController (RN/iOS). */
const AUTH_VERIFY_TIMEOUT_MS = 14_000;
/** Отправка SMS: hook отвечает сразу, доставка SMS Aero — в фоне. */
const AUTH_PHONE_OTP_SEND_TIMEOUT_MS = 22_000;
/** Вход/регистрация по паролю — нативный fetch с retry (RN iOS). */
const AUTH_PASSWORD_TIMEOUT_MS = 30_000;
/** Типы verify для email OTP в GoTrue. */
export const EMAIL_OTP_VERIFY_TYPES = ['magiclink', 'email'] as const;
export type EmailOtpVerifyType = (typeof EMAIL_OTP_VERIFY_TYPES)[number];
/** Тип в POST /otp (поле игнорируется GoTrue, оставлено для совместимости). */
export const EMAIL_OTP_TYPE = 'email' as const;
const OTP_CODE_LENGTH = 6;

const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_INITIAL_DELAY_MS = 1_000;

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

function getSupabaseConfig(): { baseUrl: string; apiKey: string } {
  const rawUrl = requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
  if (!rawUrl.trim().startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS in production');
  }
  const apiKey = requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

  if (!isValidSupabasePublishableKey(apiKey)) {
    throw new Error('Invalid Supabase API key');
  }

  return {
    baseUrl: rawUrl.trim().replace(/\/+$/, ''),
    apiKey,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function userIdFromAccessToken(accessToken: string): string | undefined {
  try {
    const payloadPart = accessToken.split('.')[1];
    if (!payloadPart) return undefined;
    const payload = JSON.parse(atob(payloadPart)) as { sub?: string };
    return payload.sub;
  } catch {
    return undefined;
  }
}

export function isRetryableFetchError(error: unknown): boolean {
  if (error instanceof AuthRequestTimeoutError || error instanceof NetworkError) {
    return true;
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
    lower.includes('abort')
  );
}

/**
 * Повторяет операцию при сетевых сбоях и таймаутах.
 * Задержки между попытками: 1000 → 2000 → 4000 мс.
 */
export async function fetchWithRetry<T>(
  operation: () => Promise<T>,
  attempts = FETCH_RETRY_ATTEMPTS,
  initialDelayMs = FETCH_RETRY_INITIAL_DELAY_MS,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt >= attempts - 1;
      if (!isRetryableFetchError(error) || isLastAttempt) {
        throw error;
      }
      const delayMs = initialDelayMs * 2 ** attempt;
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('fetch_retry_exhausted');
}

function normalizeOtpToken(token: string | undefined | null): string {
  if (token == null) {
    return '';
  }
  const digits = String(token).replace(/\D/g, '').trim();
  if (!digits) return '';
  return digits.length >= OTP_CODE_LENGTH
    ? digits.slice(0, OTP_CODE_LENGTH)
    : digits;
}

async function fetchImmediate(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (__DEV__) {
      const cause =
        error instanceof Error
          ? (error as Error & { cause?: unknown }).cause ?? error.message
          : error;
      console.warn('[Auth] fetch failed:', url.replace(/\?.*$/, ''), cause);
    }
    throw new NetworkError('network_error', error);
  }
}

function isPriorityAuthRequest(url: string): boolean {
  return url.includes('/auth/v1/verify');
}

async function readResponseTextSafe(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (firstError) {
    try {
      return await response.clone().text();
    } catch {
      throw new NetworkError('response_read_failed', firstError);
    }
  }
}

async function fetchReliable(
  url: string,
  init: RequestInit,
  timeoutMs = AUTH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  if (isPriorityAuthRequest(url)) {
    return fetchImmediate(url, init);
  }

  const request = async () => fetchWithTimeout(url, init, timeoutMs);

  if (url.includes('/auth/v1/')) {
    return enqueueAuthFetch(request);
  }
  return request();
}

function authRequestHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
  };
}

async function fetchAuthV1PostInner(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; text: string }> {
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, init);
        const text = await readResponseTextSafe(response);
        return { response, text };
      })(),
      sleep(timeoutMs).then(() => {
        throw new AuthRequestTimeoutError();
      }),
    ]);
  } catch (error) {
    if (error instanceof AuthRequestTimeoutError) {
      throw error;
    }
    throw new NetworkError('network_error', error);
  }
}

/** POST /auth/v1/verify|otp — очередь + таймаут без AbortController (RN/iOS). */
async function fetchAuthV1PostWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; text: string }> {
  return enqueueAuthFetch(() => fetchAuthV1PostInner(url, init, timeoutMs));
}

/** @deprecated Late-verify recovery удалён — verify без Promise.race. */
export function setLateVerifySessionHandler(_handler: unknown): void {
  // no-op
}

function mapAuthApiPayloadError(message: string, errorCode?: string, httpStatus?: number): Error {
  if (errorCode === 'otp_expired' || message.toLowerCase().includes('expired')) {
    return new AuthOtpVerifyError(message, 'otp_expired', httpStatus);
  }
  if (errorCode === 'invalid_otp' || message.toLowerCase().includes('invalid')) {
    return new AuthOtpVerifyError(message, 'invalid_otp', httpStatus);
  }
  if (
    errorCode === 'user_not_found' ||
    message.toLowerCase().includes('user not found') ||
    message.toLowerCase().includes('signups not allowed')
  ) {
    return new AuthOtpVerifyError(message, 'no_user', httpStatus);
  }
  return new Error(message);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AUTH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetchWithRaceTimeout(url, init, timeoutMs);
  } catch (error) {
    if (error instanceof FetchRaceTimeoutError) {
      throw new AuthRequestTimeoutError();
    }
    if (error instanceof AuthRequestTimeoutError) {
      throw error;
    }
    throw new NetworkError('network_error', error);
  }
}

type AuthFetchMode = 'default' | 'reliable';

/** Нативный fetch без обёрток — надёжнее auth-js на React Native. */
async function supabaseAuthFetch<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
  timeoutMs = AUTH_FETCH_TIMEOUT_MS,
  mode: AuthFetchMode = 'default',
): Promise<T> {
  const { baseUrl, apiKey } = getSupabaseConfig();
  const url = `${baseUrl}${path}`;
  const isVerify = path === '/auth/v1/verify';
  const requestInit: RequestInit = {
    method: init.method,
    headers: authRequestHeaders(apiKey),
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  };

  if (__DEV__ && isVerify) {
    console.info('[Auth] verifyOtp request:', init.body);
  }

  let response: Response;
  let text: string;

  if (isVerify) {
    const result = await fetchAuthV1PostWithTimeout(url, requestInit, AUTH_VERIFY_TIMEOUT_MS);
    response = result.response;
    text = result.text;
  } else if (path === '/auth/v1/otp') {
    response = await enqueueAuthFetch(() => fetchWithTimeout(url, requestInit, timeoutMs));
    text = await response.text();
  } else {
    response =
      mode === 'reliable'
        ? await fetchReliable(url, requestInit, timeoutMs)
        : await fetchWithTimeout(url, requestInit, timeoutMs);
    text = await response.text();
  }

  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = { msg: text };
    }
  }

  if (__DEV__ && path === '/auth/v1/verify') {
    console.info('[Auth] verifyOtp response:', response.status, payload.error_code ?? payload.msg ?? 'ok');
  }

  if (!response.ok) {
    const message =
      (payload.msg as string) ||
      (payload.error_description as string) ||
      (payload.message as string) ||
      (typeof payload.error === 'string' ? payload.error : undefined) ||
      (payload.error_code as string) ||
      `HTTP ${response.status}`;
    const errorCode =
      typeof payload.error_code === 'string' ? payload.error_code : undefined;
    if (path === '/auth/v1/verify') {
      throw mapAuthApiPayloadError(message, errorCode, response.status);
    }
    throw new Error(message);
  }

  return payload as T;
}

/** Запрос email OTP — прямой POST /auth/v1/otp (на RN надёжнее auth-js). */
export async function directSendEmailOtp(
  email: string,
  options?: { forRegistration?: boolean },
): Promise<void> {
  const forRegistration = options?.forRegistration ?? false;
  const normalized = normalizeEmail(email);
  const stepLabel = 'Step 1: Request OTP';
  console.time(stepLabel);
  try {
    await supabaseAuthFetch(
      '/auth/v1/otp',
      {
        method: 'POST',
        body: {
          email: normalized,
          create_user: forRegistration,
          type: EMAIL_OTP_TYPE,
          ...(forRegistration ? { data: { role: 'owner' } } : {}),
        },
      },
      AUTH_FETCH_TIMEOUT_MS,
    );
    console.timeEnd(stepLabel);
    console.info('Step 2: OTP sent');
  } catch (error) {
    console.timeEnd(stepLabel);
    throw error;
  }
}

/** @deprecated Используйте directSendEmailOtp — без retry и прогрева. */
export async function warmupSendAuthEmailHook(_force = false): Promise<void> {
  // no-op
}

/** Алиас directSendEmailOtp — retry и health-check убраны. */
export async function directSendEmailOtpReliable(
  email: string,
  options?: { forRegistration?: boolean },
): Promise<void> {
  await directSendEmailOtp(email, options);
}

async function postEmailVerifyOnce(
  email: string,
  token: string,
  type: EmailOtpVerifyType,
): Promise<DirectAuthSession> {
  const data = await supabaseAuthFetch<VerifyOtpResponse>(
    '/auth/v1/verify',
    {
      method: 'POST',
      body: {
        email: normalizeEmail(email),
        token,
        type,
      },
    },
    AUTH_FETCH_TIMEOUT_MS,
  );
  return parseVerifyResponse(data);
}

function shouldStopVerifyTypeFallback(error: AuthOtpVerifyError): boolean {
  return error.errorCode === 'otp_expired';
}

export async function directVerifyEmailOtp(
  email: string,
  token: string,
  _options?: { forRegistration?: boolean },
): Promise<DirectAuthSession> {
  const normalizedToken = normalizeOtpToken(token);
  if (normalizedToken.length !== OTP_CODE_LENGTH) {
    throw new AuthOtpVerifyError('invalid_otp_length', 'invalid_otp');
  }

  const stepLabel = 'Step 3: Verify OTP';
  console.time(stepLabel);
  try {
    let lastVerifyError: AuthOtpVerifyError | null = null;

    for (const verifyType of EMAIL_OTP_VERIFY_TYPES) {
      try {
        const session = await postEmailVerifyOnce(email, normalizedToken, verifyType);
        if (__DEV__) {
          console.info(`[Auth] verify ok with type=${verifyType}`);
        }
        console.timeEnd(stepLabel);
        console.info(`Step 4: OTP verified (user=${session.userId})`);
        return session;
      } catch (error) {
        if (error instanceof NetworkError || error instanceof AuthRequestTimeoutError) {
          throw error;
        }
        if (error instanceof AuthOtpVerifyError) {
          lastVerifyError = error;
          if (shouldStopVerifyTypeFallback(error)) {
            throw error;
          }
          if (__DEV__) {
            console.info(
              `[Auth] verify type=${verifyType} failed:`,
              error.errorCode ?? error.message
            );
          }
          continue;
        }
        throw error;
      }
    }

    throw lastVerifyError ?? new AuthOtpVerifyError('invalid_otp', 'invalid_otp');
  } catch (error) {
    console.timeEnd(stepLabel);
    throw error;
  }
}

/** Прогрев edge function send-sms (cold start). */
const SMS_HOOK_WARMUP_TIMEOUT_MS = 4_000;
const PHONE_OTP_SEND_RETRY_DELAY_MS = 700;

export async function directSendPhoneOtp(cleanPhone: string): Promise<void> {
  await supabaseAuthFetch(
    '/auth/v1/otp',
    {
      method: 'POST',
      body: {
        phone: toE164Phone(cleanPhone),
        create_user: true,
      },
    },
    AUTH_PHONE_OTP_SEND_TIMEOUT_MS,
  );
}

let smsHookWarmupDone = false;

export async function warmupSendSmsHook(force = false): Promise<void> {
  if (smsHookWarmupDone && !force) return;

  const { baseUrl, apiKey } = getSupabaseConfig();
  const hookUrl = `${baseUrl}/functions/v1/send-sms`;

  try {
    await Promise.race([
      fetch(hookUrl, {
        method: 'GET',
        headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      }),
      sleep(SMS_HOOK_WARMUP_TIMEOUT_MS),
    ]);
  } catch {
    // best-effort
  }

  smsHookWarmupDone = true;
}

export async function directSendPhoneOtpReliable(cleanPhone: string): Promise<void> {
  await warmupSendSmsHook();
  try {
    await directSendPhoneOtp(cleanPhone);
  } catch (firstError) {
    if (!isRetryableFetchError(firstError)) {
      throw firstError;
    }
    await sleep(PHONE_OTP_SEND_RETRY_DELAY_MS);
    await warmupSendSmsHook(true);
    await directSendPhoneOtp(cleanPhone);
  }
}

export interface VerifyOtpResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: { id?: string; [key: string]: unknown };
}

export interface DirectAuthSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresIn?: number;
  expiresAt?: number;
  tokenType?: string;
  user?: VerifyOtpResponse['user'];
}

function parseVerifyResponse(data: VerifyOtpResponse): DirectAuthSession {
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const userId = data.user?.id ?? (accessToken ? userIdFromAccessToken(accessToken) : undefined);

  if (!accessToken || !refreshToken || !userId) {
    throw new Error('Supabase verify response missing session');
  }

  return {
    accessToken,
    refreshToken,
    userId,
    expiresIn: data.expires_in,
    expiresAt: data.expires_at,
    tokenType: data.token_type,
    user: data.user,
  };
}

export async function directVerifyPhoneOtp(
  cleanPhone: string,
  token: string
): Promise<DirectAuthSession> {
  const data = await supabaseAuthFetch<VerifyOtpResponse>(
    '/auth/v1/verify',
    {
      method: 'POST',
      body: {
        phone: toE164Phone(cleanPhone),
        token: normalizeOtpToken(token),
        type: 'sms',
      },
    },
    AUTH_FETCH_TIMEOUT_MS,
    'reliable',
  );
  return parseVerifyResponse(data);
}

/** Вход по email + паролю (обходит auth-js на React Native). */
export async function directSignInWithPassword(
  email: string,
  password: string,
): Promise<DirectAuthSession> {
  return fetchWithRetry(async () => {
    const data = await supabaseAuthFetch<VerifyOtpResponse>(
      '/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        body: {
          email: normalizeEmail(email),
          password,
        },
      },
      AUTH_PASSWORD_TIMEOUT_MS,
      'reliable',
    );
    return parseVerifyResponse(data);
  });
}

/** Регистрация по email + паролю. */
export async function directSignUpWithPassword(
  email: string,
  password: string,
  userData?: { name?: string },
): Promise<DirectAuthSession> {
  return fetchWithRetry(async () => {
    const data = await supabaseAuthFetch<VerifyOtpResponse>(
      '/auth/v1/signup',
      {
        method: 'POST',
        body: {
          email: normalizeEmail(email),
          password,
          data: {
            role: 'owner',
            name: userData?.name?.trim() || '',
          },
        },
      },
      AUTH_PASSWORD_TIMEOUT_MS,
      'reliable',
    );
    return parseVerifyResponse(data);
  });
}

/** Сброс пароля — письмо со ссылкой. */
export async function directResetPasswordForEmail(email: string): Promise<void> {
  await fetchWithRetry(async () => {
    await supabaseAuthFetch(
      '/auth/v1/recover',
      {
        method: 'POST',
        body: { email: normalizeEmail(email) },
      },
      AUTH_PASSWORD_TIMEOUT_MS,
      'reliable',
    );
  });
}

const AUTH_HEALTH_RETRY_DELAYS_MS = [0, 400] as const;
const AUTH_HEALTH_TIMEOUT_MS = 4_000;
const AUTH_HEALTH_CACHE_MS = 90_000;

let authHealthOkAt = 0;

/** GET /auth/v1/health без AbortController — на iOS abort даёт ложный «Aborted». */
async function fetchAuthHealthOnce(): Promise<boolean> {
  const { baseUrl, apiKey } = getSupabaseConfig();
  try {
    const response = await Promise.race([
      fetchReliable(`${baseUrl}/auth/v1/health`, {
        method: 'GET',
        headers: authRequestHeaders(apiKey),
        cache: 'no-store',
      }),
      sleep(AUTH_HEALTH_TIMEOUT_MS).then((): null => null),
    ]);
    return response !== null && response.ok;
  } catch {
    return false;
  }
}

export async function directPingAuthHealth(force = false): Promise<boolean> {
  if (!force && Date.now() - authHealthOkAt < AUTH_HEALTH_CACHE_MS) {
    return true;
  }

  for (const delayMs of AUTH_HEALTH_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    if (await fetchAuthHealthOnce()) {
      authHealthOkAt = Date.now();
      return true;
    }
  }
  return false;
}

/** Установить пароль владельца после email OTP (прямой PUT /auth/v1/user). */
export async function directUpdateUserPassword(
  accessToken: string,
  password: string,
): Promise<void> {
  const { baseUrl, apiKey } = getSupabaseConfig();
  const stepLabel = 'Step 5: Set owner password';
  console.time(stepLabel);
  try {
    const response = await fetchImmediate(`${baseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        ...authRequestHeaders(apiKey),
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ password }),
      cache: 'no-store',
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { msg: text };
      }
    }
    if (!response.ok) {
      const message =
        (payload.msg as string) ||
        (payload.error_description as string) ||
        (payload.message as string) ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }
    console.timeEnd(stepLabel);
  } catch (error) {
    console.timeEnd(stepLabel);
    throw error;
  }
}

export function resolveSupabaseAuthStorageKey(): string {
  const url = requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL');
  const host = url.replace(/^https:\/\//, '').split('/')[0];
  return `sb-${host.split('.')[0]}-auth-token`;
}

export async function persistDirectSession(session: DirectAuthSession): Promise<void> {
  const expiresIn =
    session.expiresIn && session.expiresIn > 60 ? session.expiresIn : 3600;
  const expiresAt =
    session.expiresAt && session.expiresAt > Math.floor(Date.now() / 1000)
      ? session.expiresAt
      : Math.floor(Date.now() / 1000) + expiresIn;

  await secureStorageAdapter.setItem(
    resolveSupabaseAuthStorageKey(),
    JSON.stringify({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_in: expiresIn,
      expires_at: expiresAt,
      token_type: session.tokenType ?? 'bearer',
      user: session.user ?? { id: session.userId },
    })
  );
  clearStoredAccessTokenCache();
}

export async function applyDirectSession(session: DirectAuthSession): Promise<void> {
  await persistDirectSession(session);
}
