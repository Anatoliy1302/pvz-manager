const SMS_AERO_BASE = 'https://gate.smsaero.ru/v2/sms/send';
const SMS_AERO_TIMEOUT_MS = 10_000;

function normalizePhoneForSmsAero(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `7${digits}`;
  }
  return digits;
}

function pickRow(result) {
  const data = result?.data;
  return Array.isArray(data) ? data[0] : data;
}

function isBlockedStatus(extendStatus) {
  return extendStatus === 'reject' || extendStatus === 'rejected' || extendStatus === 'moderation';
}

async function postSmsAero(number, text, sign, channel) {
  const login = process.env.SMS_AERO_LOGIN ?? process.env.SMS_AERO_EMAIL;
  const secret = process.env.SMS_AERO_SECRET ?? process.env.SMS_AERO_API_KEY;

  if (!login || !secret) {
    throw new Error('SMS_AERO_LOGIN and SMS_AERO_SECRET must be set');
  }

  const credentials = Buffer.from(`${login}:${secret}`).toString('base64');
  const payload = { number, text, sign };
  if (channel) payload.channel = channel;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SMS_AERO_TIMEOUT_MS);

  try {
    const response = await fetch(SMS_AERO_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const result = await response.json();
    const row = pickRow(result);
    console.log(
      `[SMS Aero] ${response.status} sign=${sign} channel=${channel ?? 'FREE SIGN'}: ${JSON.stringify(result).slice(0, 280)}`
    );

    if (!response.ok || result.success === false) {
      const detail = result.message ?? `SMS Aero HTTP ${response.status}`;
      if (/validation/i.test(detail)) {
        throw new Error(`${detail} — проверьте SMS_AERO_SIGN («${sign}») в кабинете SMS Aero`);
      }
      throw new Error(detail);
    }

    if (isBlockedStatus(row?.extendStatus)) {
      throw new Error(`SMS Aero status: ${row.extendStatus}`);
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSms(phone, text) {
  const number = normalizePhoneForSmsAero(phone);
  const configuredSign = process.env.SMS_AERO_SIGN?.trim() || 'SMS Aero';

  // AUTH/SERVICE — для OTP; DIRECT часто уходит в moderation и не доходит до абонента.
  const attempts = [
    { sign: 'SMS Aero', channel: 'AUTH' },
    { sign: 'SMS Aero', channel: 'SERVICE' },
    { sign: 'SMS Aero', channel: undefined },
  ];
  if (configuredSign !== 'SMS Aero') {
    attempts.push({ sign: configuredSign, channel: 'SERVICE' });
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      return await postSmsAero(number, text, attempt.sign, attempt.channel);
    } catch (error) {
      lastError = error;
      console.warn(
        `[SMS Aero] retry after: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw lastError ?? new Error('SMS Aero send failed');
}

async function sendOtpSms(phone, code) {
  const template = process.env.SMS_AERO_MESSAGE_TEMPLATE?.replace('{code}', code) ?? code;
  return sendSms(phone, template);
}

module.exports = { sendOtpSms, sendSms };
