const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NOTISEND_API_URL = 'https://api.notisend.ru/v1/email/messages';
const FROM_EMAIL = process.env.NOTISEND_FROM_EMAIL || 'noreply@pvzpersonal.ru';
const FROM_NAME = process.env.NOTISEND_FROM_NAME || 'PVZ Personal';

function getNotisendApiKey() {
  return process.env.NOTISEND_API_KEY || process.env.NOTISEND_SMTP_PASSWORD || '';
}

function isEmailTestMode() {
  return process.env.EMAIL_TEST_MODE === '1' || process.env.NOTISEND_TEST_MODE === '1';
}

function buildOtpSubject(purpose) {
  if (purpose === 'pin_reset') {
    return 'Код для сброса PIN — PVZ Personal';
  }
  return 'Код для входа в PVZ Personal';
}

function buildOtpHtml(code, purpose) {
  const title =
    purpose === 'pin_reset'
      ? 'Код для сброса PIN'
      : 'Код для входа в PVZ Personal';
  return `<h2>${title}</h2>
<p>Введите этот код в приложении:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:24px 0">${code}</p>
<p>Код действителен 10 минут. Никому не сообщайте его.</p>`;
}

function buildOtpPlainText(code, purpose) {
  const title =
    purpose === 'pin_reset'
      ? 'Код для сброса PIN в PVZ Personal'
      : 'Код для входа в PVZ Personal';
  return `${title}: ${code}\n\nКод действителен 10 минут. Никому не сообщайте его.`;
}

async function pollDeliveryStatus(apiKey, messageId, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const response = await fetch(`${NOTISEND_API_URL}/${messageId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        continue;
      }
      const status = parsed.status;
      console.log(`[NotiSend] delivery id=${messageId} status=${status ?? 'unknown'}`);
      if (status === 'delivered') {
        return parsed;
      }
      if (status === 'soft_bounced' || status === 'hard_bounced') {
        const reason =
          parsed.delivery_status?.description ||
          parsed.delivery_status?.message ||
          parsed.error ||
          status;
        throw new Error(`delivery_${status}: ${reason}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('delivery_')) {
        throw error;
      }
    }
  }
  return null;
}

async function sendViaNotisendApi(to, subject, html, text) {
  const apiKey = getNotisendApiKey();
  if (!apiKey) {
    throw new Error('NOTISEND_API_KEY is not set');
  }

  const response = await fetch(NOTISEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      from_email: FROM_EMAIL,
      from_name: FROM_NAME,
      subject,
      html,
      text,
    }),
  });

  const body = await response.text();
  console.log(`[NotiSend] to=${to} status=${response.status} body=${body.slice(0, 200)}`);

  if (!response.ok) {
    throw new Error(`NotiSend HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return;
  }

  if (parsed.status === 'soft_bounced' || parsed.status === 'hard_bounced') {
    throw new Error(`delivery_${parsed.status}`);
  }

  if (parsed.id) {
    await pollDeliveryStatus(apiKey, parsed.id);
  }
}

/** @deprecated — используйте sendOtpEmail */
function sendEmail(to, subject, text) {
  return sendViaNotisendApi(to, subject, `<p>${text.replace(/\n/g, '<br>')}</p>`, text);
}

/** Отправка OTP-кода через NotiSend (как send-auth-email Edge Function). */
async function sendOtpEmail(to, code, purpose = 'login') {
  if (isEmailTestMode()) {
    console.log(`[send-otp][test] to=${to} code=${code} purpose=${purpose}`);
    return { testMode: true };
  }

  const subject = buildOtpSubject(purpose);
  const html = buildOtpHtml(code, purpose);
  const text = buildOtpPlainText(code, purpose);
  await sendViaNotisendApi(to, subject, html, text);
  return { testMode: false };
}

module.exports = { sendEmail, sendOtpEmail, isEmailTestMode, getNotisendApiKey };
