import { normalizeEmail } from '../src/utils/loginIdentifier';
import { toE164Phone } from '../src/utils/phoneHelpers';
import { secureStorageAdapter } from '../src/utils/secureStorageAdapter';
import { withTimeoutReject } from '../src/utils/withTimeout';
import {
  requireExpoPublicEnv,
  isValidSupabasePublishableKey,
} from './expoPublicEnv';

const AUTH_FETCH_TIMEOUT_MS = 15_000;
/** Отправка email: Supabase hook + NotiSend SMTP/API. */
const AUTH_EMAIL_OTP_SEND_TIMEOUT_MS = 30_000;
/** Отправка SMS: Supabase hook → SMS Aero (hook отвечает сразу, доставка в фоне). */
const AUTH_PHONE_OTP_SEND_TIMEOUT_MS = 20_000;
const AUTH_VERIFY_TIMEOUT_MS = 18_000;
/** email — OTP вход (Dashboard); magiclink — запасной type. */
const VERIFY_EMAIL_TYPES = ['email', 'magiclink'] as const;

const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_INITIAL_DELAY_MS = 1_000;

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
    lower.includes('load failed')
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

/**
 * Неверный type verify → GoTrue часто отвечает «expired or is invalid».
 * Такое сообщение нужно пробовать со следующим type, а не останавливаться.
 */
function isRetryableVerifyTypeError(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes('expired') && lower.includes('invalid')) {
    return true;
  }
  if (lower.includes('otp_expired') || lower.includes('token has expired')) {
    return false;
  }
  return (
    lower.includes('invalid') ||
    lower.includes('403') ||
    lower.includes('otp')
  );
}

function normalizeOtpToken(token: string | undefined | null): string {
  if (token == null) {
    return '';
  }
  return String(token).replace(/\D/g, '').trim();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AUTH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await Promise.race([
      fetch(url, init),
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

/** Нативный fetch без обёрток — надёжнее auth-js на React Native. */
async function supabaseAuthFetch<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
  timeoutMs = AUTH_FETCH_TIMEOUT_MS,
): Promise<T> {
  const { baseUrl, apiKey } = getSupabaseConfig();

  const response = await fetchWithTimeout(
    `${baseUrl}${path}`,
    {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    },
    timeoutMs,
  );

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
      (payload.error as string) ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function directSendEmailOtp(email: string): Promise<void> {
  await supabaseAuthFetch(
    '/auth/v1/otp',
    {
      method: 'POST',
      body: {
        email: normalizeEmail(email),
        create_user: true,
      },
    },
    AUTH_EMAIL_OTP_SEND_TIMEOUT_MS,
  );
}

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

async function directVerifyEmailOtpOnce(
  email: string,
  token: string,
  type: (typeof VERIFY_EMAIL_TYPES)[number]
): Promise<DirectAuthSession> {
  const data = await supabaseAuthFetch<VerifyOtpResponse>(
    '/auth/v1/verify',
    {
      method: 'POST',
      body: {
        email: normalizeEmail(email),
        token: normalizeOtpToken(token),
        type,
      },
    },
    AUTH_VERIFY_TIMEOUT_MS,
  );
  return parseVerifyResponse(data);
}

async function directVerifyEmailOtpAttempt(
  email: string,
  token: string
): Promise<DirectAuthSession> {
  const errors: Error[] = [];

  for (const type of VERIFY_EMAIL_TYPES) {
    try {
      return await directVerifyEmailOtpOnce(email, token, type);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);
      if (__DEV__) {
        console.info(`[Auth] verifyOtp type=${type} failed:`, err.message);
      }
      if (isRetryableFetchError(err)) {
        throw err;
      }
      if (!isRetryableVerifyTypeError(err.message)) {
        throw err;
      }
    }
  }

  const nonExpired = errors.find((err) => !err.message.toLowerCase().includes('expired'));
  throw nonExpired ?? errors[errors.length - 1] ?? new Error('Invalid OTP');
}

export async function directVerifyEmailOtp(
  email: string,
  token: string
): Promise<DirectAuthSession> {
  return directVerifyEmailOtpAttempt(email, token);
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
    AUTH_VERIFY_TIMEOUT_MS,
  );
  return parseVerifyResponse(data);
}

const AUTH_HEALTH_RETRY_DELAYS_MS = [0] as const;
const AUTH_HEALTH_TIMEOUT_MS = 4_000;

/** GET /auth/v1/health без AbortController — на iOS abort даёт ложный «Aborted». */
async function fetchAuthHealthOnce(): Promise<boolean> {
  const { baseUrl, apiKey } = getSupabaseConfig();
  try {
    const response = await Promise.race([
      fetch(`${baseUrl}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: apiKey },
      }),
      sleep(AUTH_HEALTH_TIMEOUT_MS).then((): null => null),
    ]);
    return response !== null && response.ok;
  } catch {
    return false;
  }
}

export async function directPingAuthHealth(): Promise<boolean> {
  for (const delayMs of AUTH_HEALTH_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }
    if (await fetchAuthHealthOnce()) {
      return true;
    }
  }
  return false;
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
}

export async function applyDirectSession(session: DirectAuthSession): Promise<void> {
  await persistDirectSession(session);
  void syncSupabaseClientSession(session.accessToken, session.refreshToken);
}

/** Не блокирует UI — JWT уже в storage, клиент догонит в фоне. */
async function syncSupabaseClientSession(accessToken: string, refreshToken: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    const { error } = await withTimeoutReject(
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      8_000,
      'session_apply_timeout'
    );
    if (error && __DEV__) {
      console.warn('[Auth] setSession after verify:', error.message);
    }
  } catch (error: unknown) {
    if (__DEV__) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Auth] setSession in background:', message);
    }
  }
}
