const { getSmsAeroSign, formatSmsOtpText } = require('./smsAeroSign');
const { buildSignUnavailableMessage } = require('./smsAeroStartupCheck');
const { getSmsAeroCredentials } = require('./smsAeroCredentials');
const { isProduction } = require('./httpErrors');

const SMS_AERO_BASE = 'https://gate.smsaero.ru/v2/sms/send';
const SMS_AERO_TIMEOUT_MS = 10_000;

/** Каналы gate API — без undefined (иначе SMS Aero считает как FREE SIGN). */
const SMS_CHANNELS = ['DIRECT', 'AUTH', 'SERVICE'];

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
  const creds = getSmsAeroCredentials();
  if (!creds) {
    throw new Error(isProduction() ? 'SMS delivery failed' : 'SMS Aero credentials not set (SMSAERO_EMAIL + SMSAERO_API_KEY)');
  }
  const { login, secret } = creds;

  const credentials = Buffer.from(`${login}:${secret}`).toString('base64');
  const payload = { number, text, sign, channel };

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
      `[SMS Aero] ${response.status} sign=${sign} channel=${channel}: ${JSON.stringify(result).slice(0, 280)}`
    );

    if (!response.ok || result.success === false) {
      const detail = result.message ?? `SMS Aero HTTP ${response.status}`;
      if (/validation/i.test(detail)) {
        const err = new Error(
          isProduction()
            ? 'SMS delivery failed'
            : `${detail} — проверьте SMS_AERO_SIGN («${sign}») в кабинете SMS Aero`
        );
        err.signValidation = Boolean(result?.data?.sign);
        throw err;
      }
      throw new Error(isProduction() ? 'SMS delivery failed' : detail);
    }

    if (isBlockedStatus(row?.extendStatus)) {
      throw new Error(isProduction() ? 'SMS delivery failed' : `SMS Aero status: ${row.extendStatus}`);
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendSms(phone, text) {
  const number = normalizePhoneForSmsAero(phone);
  const sign = getSmsAeroSign();

  let lastError;
  for (const channel of SMS_CHANNELS) {
    try {
      return await postSmsAero(number, text, sign, channel);
    } catch (error) {
      lastError = error;
      console.warn(
        `[SMS Aero] sign=${sign} channel=${channel} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      if (error?.signValidation) break;
    }
  }

  throw lastError?.signValidation
    ? new Error(buildSignUnavailableMessage(sign))
    : (lastError ?? new Error(`SMS Aero send failed (sign=${sign})`));
}

async function sendOtpSms(phone, code) {
  return sendSms(phone, formatSmsOtpText(code));
}

module.exports = { sendOtpSms, sendSms, getSmsAeroSign };
