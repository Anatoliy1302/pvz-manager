const GATE_BASE = 'https://gate.smsaero.ru/v2';
const REQUEST_TIMEOUT_MS = 12_000;

function normalizePhoneForApi(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    digits = `7${digits}`;
  }
  return digits;
}

function getSign() {
  return process.env.SMSAERO_SIGN ?? process.env.SMS_AERO_SIGN ?? 'PVZ';
}

/** Basic Auth: email:api_key для gate API (mobile-id). */
function getGateCredentials() {
  const login =
    process.env.SMSAERO_GATE_LOGIN ??
    process.env.SMSAERO_LOGIN ??
    process.env.SMS_AERO_LOGIN ??
    process.env.SMS_AERO_EMAIL ??
    process.env.SMSAERO_CLIENT_ID;
  const secret =
    process.env.SMSAERO_GATE_API_KEY ??
    process.env.SMSAERO_API_KEY ??
    process.env.SMSAERO_SECRET ??
    process.env.SMS_AERO_SECRET ??
    process.env.SMS_AERO_API_KEY;
  if (!login || !secret) {
    throw new Error('SMS Aero credentials not configured (SMSAERO_GATE_LOGIN + SMSAERO_GATE_API_KEY)');
  }
  return { login, secret };
}

function getCallbackUrl() {
  const base = process.env.PUBLIC_API_URL ?? process.env.API_PUBLIC_URL ?? 'http://79.137.192.194:3000';
  return `${String(base).replace(/\/$/, '')}/api/webhooks/smsaero-mobile-id`;
}

async function gateRequest(path, body) {
  const { login, secret } = getGateCredentials();
  const auth = Buffer.from(`${login}:${secret}`).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GATE_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      throw new Error(`SMS Aero invalid response: ${text.slice(0, 200)}`);
    }

    console.log(`[SMS Aero] ${path} ${response.status}: ${JSON.stringify(result).slice(0, 280)}`);

    if (!response.ok || result.success === false) {
      const detail = result.message ?? `SMS Aero HTTP ${response.status}`;
      throw new Error(detail);
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Создание сессии мобильной авторизации (SMS OTP / SIM-PUSH).
 * Эндпоинт create-session в API отсутствует — используется mobile-id/send.
 */
async function createAuthSession(phone) {
  const number = normalizePhoneForApi(phone);
  const sign = getSign();

  // Попытка create-session (на случай появления в API)
  try {
    const legacy = await gateRequest('/auth/create-session', { phone: number, sign });
    const id = legacy?.data?.id ?? legacy?.data?.sessionId;
    if (id != null) {
      return { aeroRequestId: Number(id), number, sign };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/not found|404|method not found/i.test(message)) {
      console.warn('[SMS Aero] create-session unavailable:', message);
    }
  }

  const result = await gateRequest('/mobile-id/send', {
    number,
    sign,
    callbackUrl: getCallbackUrl(),
  });

  const row = result.data;
  const aeroRequestId = row?.id;
  if (aeroRequestId == null) {
    throw new Error('SMS Aero did not return session id');
  }

  return { aeroRequestId: Number(aeroRequestId), number, sign, status: row.status };
}

async function createAuthSessionWithFallback(phone) {
  try {
    return await createAuthSession(phone);
  } catch (error) {
    if (process.env.SMSAERO_TEST_MODE === '1') {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[SMS Aero] test mode fallback (send skipped): ${message}`);
      return {
        aeroRequestId: 0,
        number: normalizePhoneForApi(phone),
        sign: getSign(),
        testMode: true,
      };
    }
    throw error;
  }
}

/** Отправка SMS OTP через SMS Aero Mobile Auth. */
async function sendSmsOtp(phone) {
  return createAuthSessionWithFallback(phone);
}

async function verifyAuthCode(aeroRequestId, code) {
  const sign = getSign();
  const cleanCode = String(code).replace(/\D/g, '').trim();
  if (!cleanCode) {
    throw new Error('Code required');
  }

  // Тестовый режим SMS Aero: код всегда 1234
  if (process.env.SMSAERO_TEST_MODE === '1' && cleanCode === '1234') {
    return { verified: true, testMode: true };
  }

  if (Number(aeroRequestId) === 0 && process.env.SMSAERO_TEST_MODE === '1') {
    throw new Error('Invalid or expired code');
  }

  const result = await gateRequest('/mobile-id/verify', {
    id: Number(aeroRequestId),
    sign,
    code: cleanCode,
  });

  const status = result?.data?.status;
  // 1 = пройдено (успех), 2 = не пройдено
  if (status === 1) {
    return { verified: true, data: result.data };
  }
  if (status === 2) {
    throw new Error('Mobile auth failed');
  }

  throw new Error('Invalid or expired code');
}

async function getAuthStatus(aeroRequestId) {
  const result = await gateRequest('/mobile-id/status', { id: Number(aeroRequestId) });
  return result.data;
}

function getSmsCodeLength() {
  return process.env.SMSAERO_TEST_MODE === '1' ? 4 : 4;
}

module.exports = {
  sendSmsOtp,
  createAuthSession: createAuthSessionWithFallback,
  verifyAuthCode,
  getAuthStatus,
  normalizePhoneForApi,
  getSmsCodeLength,
};
