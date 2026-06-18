/**
 * Проверка send-auth-email / NotiSend БЕЗ лишних писем.
 *
 * По умолчанию — только статус функции (GET), без SMTP.
 * Реальная тест-отправка: node supabase/setup/check-notisend-limits.mjs --send
 */
import fs from 'fs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-auth-email`;
const TEST_EMAIL = 'healthcheck@users.pvzpersonal.ru';
const sendTest = process.argv.includes('--send');

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].trim();
  return value.length > 0 ? value : undefined;
}

const anonKey = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

async function probeHookReachable() {
  const response = await fetch(HOOK_URL, { method: 'GET' });
  return { status: response.status };
}

async function probeHookSend() {
  const response = await fetch(HOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      user: { email: TEST_EMAIL },
      email_data: { token: '000000' },
    }),
  });
  const text = await response.text();
  return { status: response.status, text };
}

console.log('=== NotiSend / send-auth-email health check ===\n');

const reachable = await probeHookReachable();
console.log('Function URL:', reachable.status === 405 || reachable.status === 200 ? 'OK' : reachable.status);

if (!sendTest) {
  console.log('\nПропуск SMTP-теста (экономит лимит NotiSend).');
  console.log('Для одной тест-отправки: node supabase/setup/check-notisend-limits.mjs --send');
  console.log('\nЕсли в логах Supabase «too many messages» — подождите 15–20 мин.');
  process.exit(0);
}

console.log('\n⚠️  --send: отправка тестового письма на', TEST_EMAIL);

const hook = await probeHookSend();
console.log('Hook POST:', hook.status, hook.text.slice(0, 280));

if (
  hook.status === 429 ||
  hook.text.toLowerCase().includes('too many messages')
) {
  const wait = hook.text.match(/(\d+)\s*minutes?/i);
  console.log('\n⚠️  RATE LIMITED — NotiSend блокирует отправку.');
  console.log(`   Подождите ~${wait?.[1] ?? '15'} мин. Не запускайте --send и не жмите OTP в приложении.`);
  process.exit(1);
}

if (hook.status === 200) {
  console.log('\n✓ Тестовое письмо отправлено.');
  try {
    const payload = JSON.parse(hook.text);
    const messageId = payload?.id;
    if (messageId) {
      const apiKey = loadEnv('NOTISEND_SMTP_PASSWORD');
      await new Promise((r) => setTimeout(r, 4000));
      const statusRes = await fetch(`https://api.notisend.ru/v1/email/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const statusBody = await statusRes.json();
      console.log('NotiSend delivery status:', statusBody.status ?? statusRes.status);
      if (statusBody.status === 'soft_bounced' || statusBody.status === 'hard_bounced') {
        console.log(
          '\n⚠️  Письмо отклонено почтовиком. Проверьте DKIM для pvzpersonal.ru в NotiSend → Домены → DNS.'
        );
      }
    }
  } catch {
    // optional status poll
  }
} else {
  console.log('\n✗ Ошибка hook — см. Supabase → Functions → send-auth-email → Logs');
}
