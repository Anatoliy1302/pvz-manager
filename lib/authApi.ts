import { getApiUrl, API_AUTH } from '../config/api';
import { fetchWithRaceTimeout } from './fetchWithRaceTimeout';
import { normalizeEmail } from '../src/utils/loginIdentifier';
import { cleanPhone } from '../src/utils/phoneHelpers';

const AUTH_TIMEOUT_MS = 30_000;

export class AuthApiError extends Error {
  readonly httpStatus: number;
  readonly errorCode?: string;

  constructor(message: string, httpStatus: number, errorCode?: string) {
    super(message);
    this.name = 'AuthApiError';
    this.httpStatus = httpStatus;
    this.errorCode = errorCode;
  }
}

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken?: string;
}

export interface StaffAuthSession extends AuthSession {
  invitations?: Array<{
    id: string;
    phone: string;
    name: string;
    role: 'employee' | 'admin';
    pvzId: string;
    pvzName?: string;
    status: string;
    invitedBy: string;
  }>;
}

type ApiRecord = Record<string, unknown>;

function mapApiError(message: string, status: number): string | undefined {
  const lower = message.toLowerCase();
  if (status === 404 || lower.includes('user not found')) return 'no_user';
  if (lower.includes('email service not configured') || lower.includes('not configured')) {
    return 'email_not_configured';
  }
  if (lower.includes('email delivery failed') || lower.includes('delivery_')) {
    return 'email_delivery_failed';
  }
  if (lower.includes('mail.ru rejected') || lower.includes('spf/dkim')) {
    return 'email_delivery_failed';
  }
  if (lower.includes('invalid or expired')) return 'invalid_otp';
  if (lower.includes('wrong pin') || lower.includes('invalid pin')) return 'invalid_credentials';
  if (lower.includes('rate limit') || lower.includes('too many')) return 'rate_limit';
  return undefined;
}

function parseUserId(payload: ApiRecord): string | null {
  const user = payload.user;
  if (user && typeof user === 'object') {
    const id = (user as ApiRecord).id;
    if (typeof id === 'string' && id) return id;
  }
  if (typeof payload.userId === 'string' && payload.userId) return payload.userId;
  if (typeof payload.user_id === 'string' && payload.user_id) return payload.user_id;
  return null;
}

function parseAccessToken(payload: ApiRecord): string | null {
  if (typeof payload.accessToken === 'string' && payload.accessToken) return payload.accessToken;
  if (typeof payload.access_token === 'string' && payload.access_token) return payload.access_token;
  if (typeof payload.token === 'string' && payload.token) return payload.token;
  return null;
}

function parseRefreshToken(payload: ApiRecord): string | undefined {
  if (typeof payload.refreshToken === 'string' && payload.refreshToken) return payload.refreshToken;
  if (typeof payload.refresh_token === 'string' && payload.refresh_token) return payload.refresh_token;
  return undefined;
}

export function parseAuthSession(payload: ApiRecord): AuthSession {
  const accessToken = parseAccessToken(payload);
  if (!accessToken) {
    throw new AuthApiError('auth_response_missing_token', 500);
  }

  let userId = parseUserId(payload);
  if (!userId) {
    try {
      const part = accessToken.split('.')[1];
      if (part) {
        const decoded = JSON.parse(atob(part)) as { sub?: string; id?: string };
        userId = decoded.sub ?? decoded.id ?? null;
      }
    } catch {
      // ignore
    }
  }

  if (!userId) {
    throw new AuthApiError('auth_response_missing_user', 500);
  }

  return {
    userId,
    accessToken,
    refreshToken: parseRefreshToken(payload),
  };
}

async function readJson(response: Response): Promise<ApiRecord> {
  try {
    const data = (await response.json()) as unknown;
    if (data && typeof data === 'object') {
      return data as ApiRecord;
    }
  } catch {
    // ignore
  }
  return {};
}

async function apiPost(
  path: string,
  body: ApiRecord,
  token?: string
): Promise<ApiRecord> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}${path}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    AUTH_TIMEOUT_MS
  );

  const payload = await readJson(response);
  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.message === 'string' && payload.message) ||
      `HTTP ${response.status}`;
    throw new AuthApiError(message, response.status, mapApiError(message, response.status));
  }

  return payload;
}

export type EmailOtpPurpose = 'login' | 'pin_reset';

/** POST /api/auth/send-otp */
export async function sendOtp(
  email: string,
  options?: { purpose?: EmailOtpPurpose }
): Promise<void> {
  await apiPost('/api/auth/send-otp', {
    email: normalizeEmail(email),
    ...(options?.purpose ? { purpose: options.purpose } : {}),
  });
}

/** POST /api/auth/verify-otp */
export async function verifyOtp(email: string, code: string): Promise<AuthSession> {
  const payload = await apiPost('/api/auth/verify-otp', {
    email: normalizeEmail(email),
    code: code.replace(/\D/g, '').trim(),
  });
  return parseAuthSession(payload);
}

/** POST /api/auth/set-pin */
export async function setPin(pin: string, token: string): Promise<void> {
  await apiPost('/api/auth/set-pin', { pin }, token);
}

/** POST /api/auth/login */
export async function login(email: string, pin: string): Promise<AuthSession> {
  const payload = await apiPost('/api/auth/login', {
    email: normalizeEmail(email),
    pin,
  });
  return parseAuthSession(payload);
}

/** POST /api/auth/reset-pin */
export async function resetPin(
  email: string,
  code: string,
  pin: string,
  token: string
): Promise<void> {
  await apiPost(
    '/api/auth/reset-pin',
    {
      email: normalizeEmail(email),
      code: code.replace(/\D/g, '').trim(),
      pin,
    },
    token
  );
}

/** POST /api/auth/send-sms — SMS Aero Mobile Auth */
export async function sendSmsOtp(phone: string, role: 'employee' | 'admin'): Promise<void> {
  await apiPost(API_AUTH.sendSms, {
    phone: cleanPhone(phone),
    role,
  });
}

/** POST /api/auth/verify-sms — SMS Aero Mobile Auth */
export async function verifySmsOtp(
  phone: string,
  code: string,
  role: 'employee' | 'admin'
): Promise<StaffAuthSession> {
  const payload = await apiPost(API_AUTH.verifySms, {
    phone: cleanPhone(phone),
    code: code.replace(/\D/g, '').trim(),
    role,
  });
  const session = parseAuthSession(payload);
  const invitations = Array.isArray(payload.invitations)
    ? (payload.invitations as StaffAuthSession['invitations'])
    : undefined;
  return { ...session, invitations };
}

/** Проверка существования email владельца через login (404 = не найден). */
export async function checkOwnerEmailExistsOnServer(email: string): Promise<boolean | null> {
  try {
    await login(normalizeEmail(email), '0000');
    return true;
  } catch (error) {
    if (error instanceof AuthApiError) {
      if (error.httpStatus === 404 || error.errorCode === 'no_user') {
        return false;
      }
      if (error.httpStatus === 401 || error.errorCode === 'invalid_credentials') {
        return true;
      }
      if (error.httpStatus >= 500) {
        return null;
      }
    }
    return null;
  }
}

/** Health-check API. */
export async function pingApiHealth(): Promise<boolean> {
  try {
    const response = await fetchWithRaceTimeout(`${getApiUrl()}/`, { method: 'GET' }, 8_000);
    if (!response.ok) return false;
    const payload = await readJson(response);
    return payload.status === 'ok';
  } catch {
    return false;
  }
}
