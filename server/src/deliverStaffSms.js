const { sendOtpSms } = require('./smsaero');
const { sendOtpViaSupabaseFunction, getSendSmsUrl } = require('./supabaseSms');

function smsAeroConfigured() {
  return Boolean(process.env.SMS_AERO_LOGIN || process.env.SMS_AERO_EMAIL);
}

function devSmsLogEnabled() {
  return process.env.DEV_SMS_LOG_OTP === '1' && process.env.NODE_ENV !== 'production';
}

/** Отправка OTP-сообщения сотруднику. Бросает ошибку, если доставка не удалась. */
async function deliverStaffSmsOtp(phone, code) {
  if (smsAeroConfigured()) {
    await sendOtpSms(phone, code);
    return { provider: 'smsaero' };
  }

  if (getSendSmsUrl()) {
    return sendOtpViaSupabaseFunction(phone, code);
  }

  if (devSmsLogEnabled()) {
    console.log(`[dev] SMS OTP for ${phone}: ${code}`);
    return { provider: 'dev-log' };
  }

  throw new Error('SMS not configured (set SMS_AERO_LOGIN/SMS_AERO_SECRET on server)');
}

module.exports = { deliverStaffSmsOtp, smsAeroConfigured, devSmsLogEnabled };
