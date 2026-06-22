const DEFAULT_SEND_SMS_URL =
  'https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/send-sms';
const SEND_SMS_TIMEOUT_MS = 12_000;

function getSendSmsUrl() {
  const raw = process.env.SUPABASE_SEND_SMS_URL;
  if (raw === '0' || raw === 'false') return null;
  return raw?.trim() || DEFAULT_SEND_SMS_URL;
}

async function sendOtpViaSupabaseFunction(phone, code) {
  const url = getSendSmsUrl();
  if (!url) {
    throw new Error('SUPABASE_SEND_SMS_URL is disabled');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_SMS_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone, code }),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 300);
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.error?.message ?? parsed?.message ?? detail;
      } catch {
        // keep raw text
      }
      throw new Error(detail || `Supabase send-sms HTTP ${response.status}`);
    }

    console.log(`[Supabase send-sms] OK for ${String(phone).replace(/\d(?=\d{2})/g, '*')}`);
    return { provider: 'supabase' };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendOtpViaSupabaseFunction, getSendSmsUrl };
