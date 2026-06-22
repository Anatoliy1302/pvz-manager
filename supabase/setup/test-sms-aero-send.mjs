/**
 * Тест отправки SMS через SMS Aero API (не Supabase hook).
 * Usage: node supabase/setup/test-sms-aero-send.mjs +79143288207
 */
import fs from 'fs';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const login =
  process.env.SMS_AERO_LOGIN ??
  process.env.SMS_AERO_EMAIL ??
  loadEnv('SMS_AERO_LOGIN') ??
  loadEnv('SMS_AERO_EMAIL');
const secret =
  process.env.SMS_AERO_SECRET ??
  process.env.SMS_AERO_API_KEY ??
  loadEnv('SMS_AERO_SECRET') ??
  loadEnv('SMS_AERO_API_KEY');
const sign = process.env.SMS_AERO_SIGN ?? loadEnv('SMS_AERO_SIGN') ?? 'SMS Aero';
const phone = process.argv[2] || '+79143288207';

if (!login || !secret) {
  console.error('Задайте SMS_AERO_LOGIN + SMS_AERO_SECRET (или EMAIL + API_KEY) в .env');
  process.exit(1);
}

const digits = phone.replace(/\D/g, '');
const number =
  digits.length === 11 && digits.startsWith('8')
    ? `7${digits.slice(1)}`
    : digits.length === 10
      ? `7${digits}`
      : digits;

const auth = Buffer.from(`${login}:${secret}`).toString('base64');
const res = await fetch('https://gate.smsaero.ru/v2/sms/send', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({
    number,
    text: 'PVZ Personal: тест SMS (можно игнорировать)',
    sign,
    channel: 'DIRECT',
  }),
});

const body = await res.json();
console.log('HTTP', res.status);
console.log(JSON.stringify(body, null, 2));

if (body.success) {
  console.log('\n✅ SMS Aero принял отправку на', number);
  process.exit(0);
}

console.error('\n❌ Ошибка. Если Validation error — одобрите подпись «' + sign + '» в кабинете SMS Aero.');
process.exit(1);
