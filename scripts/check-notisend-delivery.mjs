/**
 * Тест доставки NotiSend (VPS API / email OTP, без Supabase).
 *
 *   node scripts/check-notisend-delivery.mjs <message_id>
 *   node scripts/check-notisend-delivery.mjs --send user@example.com
 */
import fs from 'fs';

function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!fs.existsSync('.env')) return undefined;
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^#?\\s*${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const apiKey = loadEnv('NOTISEND_API_KEY') ?? loadEnv('NOTISEND_SMTP_PASSWORD');
if (!apiKey) {
  console.error('NOTISEND_API_KEY / NOTISEND_SMTP_PASSWORD missing in .env');
  process.exit(1);
}

const sendIdx = process.argv.indexOf('--send');
const sendTo = sendIdx !== -1 ? process.argv[sendIdx + 1] : null;
const messageId = sendTo ? null : process.argv[2];

async function fetchStatus(id) {
  const res = await fetch(`https://api.notisend.ru/v1/email/messages/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await res.json();
  return { http: res.status, body };
}

async function sendTest(to) {
  const from = loadEnv('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru';
  const res = await fetch('https://api.notisend.ru/v1/email/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      from_email: from,
      from_name: 'PVZ Personal',
      subject: 'PVZ Personal — тест доставки',
      html: '<p>Тест доставки OTP. Если письмо не пришло — смотрите статус ниже.</p>',
      text: 'Тест доставки OTP',
    }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { http: res.status, body: parsed };
}

function explainStatus(status) {
  switch (status) {
    case 'delivered':
      return '✓ Доставлено — проверьте входящие и спам.';
    case 'queued':
    case 'sent':
      return '⏳ В очереди / отправляется — подождите 1–3 мин и проверьте снова.';
    case 'soft_bounced':
      return [
        '✗ soft_bounced — почтовик (часто mail.ru) временно отклонил письмо.',
        '  1. node scripts/check-pvzpersonal-dns.mjs',
        '  2. NotiSend → Домены → pvzpersonal.ru → «Проверить».',
        '  3. Для теста попробуйте Gmail / Yandex.',
      ].join('\n');
    case 'hard_bounced':
      return '✗ hard_bounced — адрес недействителен или домен заблокирован.';
    default:
      return `Статус: ${status ?? 'unknown'}`;
  }
}

if (sendTo) {
  console.log('Отправка теста на', sendTo, '…\n');
  const sent = await sendTest(sendTo);
  console.log('API', sent.http, JSON.stringify(sent.body, null, 2));
  const id = sent.body?.id;
  if (!id) {
    process.exit(sent.http === 200 || sent.http === 201 ? 0 : 1);
  }
  console.log('\nОжидание доставки (до 45 с)…');
  let finalBody = sent.body;
  for (let i = 0; i < 9; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await fetchStatus(id);
    finalBody = status.body;
    const s = finalBody?.status;
    process.stdout.write(`  ${(i + 1) * 5}с: ${s ?? 'unknown'}\n`);
    if (s === 'delivered' || s === 'soft_bounced' || s === 'hard_bounced') {
      break;
    }
  }
  console.log('\n--- Статус доставки ---');
  console.log(JSON.stringify(finalBody, null, 2));
  console.log('\n' + explainStatus(finalBody?.status));
  process.exit(finalBody?.status === 'delivered' ? 0 : 1);
}

if (!messageId) {
  console.error('Usage:');
  console.error('  node scripts/check-notisend-delivery.mjs <message_id>');
  console.error('  node scripts/check-notisend-delivery.mjs --send user@example.com');
  process.exit(1);
}

const status = await fetchStatus(messageId);
console.log(JSON.stringify(status.body, null, 2));
console.log('\n' + explainStatus(status.body?.status));

if (status.body?.status === 'soft_bounced' || status.body?.status === 'hard_bounced') {
  console.log('\nКод из письма (если бы дошло):', status.body?.text?.match(/\d{6}/)?.[0] ?? '—');
}
