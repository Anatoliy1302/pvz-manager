/**
 * Тест email OTP: отправка + verify (type=email).
 * Run: node supabase/setup/test-email-otp-flow.mjs <email> [code]
 *
 * ВАЖНО: реальный email (krv_kravec@mail.ru), не «ваш@email.ru».
 * Один код = одна проверка. Не открывайте приложение до проверки (иначе новый OTP сотрёт старый).
 */
import fs from 'fs';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/[^\x00-\x7F]/.test(email);
}

const baseUrl = (loadEnv('EXPO_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const apiKey = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || loadEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const email = (process.argv[2] || '').trim().toLowerCase();
const code = (process.argv[3] || '').replace(/\D/g, '');

if (!baseUrl || !apiKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or key in .env');
  process.exit(1);
}
if (!email) {
  console.error('Usage: node supabase/setup/test-email-otp-flow.mjs <email> [6-digit-code]');
  process.exit(1);
}
if (!isValidEmail(email)) {
  console.error('❌ Некорректный email:', email);
  console.error('   Пример: krv_kravec@mail.ru');
  process.exit(1);
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, text };
}

if (!code) {
  console.log('Sending OTP to', email, '...');
  const send = await post('/auth/v1/otp', {
    email,
    create_user: true,
    type: 'email',
    data: { role: 'owner' },
  });
  console.log('POST /auth/v1/otp:', send.status, JSON.stringify(send.json).slice(0, 300));
  if (send.status >= 400) process.exit(1);
  console.log('\n✅ OTP sent. Сразу после письма (не открывая приложение):');
  console.log(`   node supabase/setup/test-email-otp-flow.mjs ${email} <CODE>`);
  process.exit(0);
}

console.log('Verifying code', code, 'for', email);
const verifyTypes = ['magiclink', 'email', 'signup', 'recovery'];
let sessionOk = false;
for (const type of verifyTypes) {
  const verify = await post('/auth/v1/verify', { email, token: code, type });
  const ok = verify.status >= 200 && verify.status < 300;
  const err = verify.json.error_code || verify.json.msg || verify.json.error_description;
  console.log(`  type=${type} → ${verify.status} ${ok ? '✅ SESSION OK' : '❌ ' + (err || verify.text?.slice(0, 120))}`);
  if (ok && verify.json.access_token) {
    console.log('     user_id:', verify.json.user?.id || '(from jwt)');
    sessionOk = true;
    break;
  }
  if (verify.json.error_code === 'otp_expired') {
    console.log('\n💡 Код недействителен. Частые причины:');
    console.log('   • Уже нажали «Подтвердить» в приложении (код сгорел)');
    console.log('   • Пришло новое письмо — нужен код из ПОСЛЕДНЕГО');
    console.log('   • Запросите код заново и проверьте сразу:');
    console.log(`     node supabase/setup/test-email-otp-flow.mjs ${email}`);
    break;
  }
}
if (!sessionOk) {
  console.log('\n❌ Ни один type verify не прошёл');
}

const health = await fetch(`${baseUrl}/auth/v1/health`, { headers: { apikey: apiKey } });
console.log('\nhealth:', health.status);
