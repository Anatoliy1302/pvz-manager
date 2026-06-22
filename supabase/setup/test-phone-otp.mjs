/**
 * Проверка: включён ли Phone provider и отвечает ли /auth/v1/otp.
 * Run: node supabase/setup/test-phone-otp.mjs [+79991234567]
 */
import fs from 'fs';
import { loadAccessToken } from './loadAccessToken.mjs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const url = loadEnv('EXPO_PUBLIC_SUPABASE_URL');
const key = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const phone = process.argv[2] || '+79001234567';

const otpRes = await fetch(`${url}/auth/v1/otp`, {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone, create_user: true }),
});
const otpBody = await otpRes.text();
console.log('POST /auth/v1/otp:', otpRes.status, otpBody);

if (otpBody.includes('phone_provider_disabled')) {
  console.log('\n❌ Phone provider ВЫКЛЮЧЕН в Supabase.');
  console.log('Исправление:');
  console.log('  1. Dashboard → Account → Access Tokens → создайте токен');
  console.log('  2. Добавьте в .env: SUPABASE_ACCESS_TOKEN=sbp_...');
  console.log('  3. node supabase/setup/enable-auth-phone.mjs');
  process.exit(1);
}

const token = loadAccessToken();
if (token) {
  const authRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const auth = await authRes.json();
  if (authRes.ok) {
    console.log('\nAuth config:');
    console.log('  external_phone_enabled:', auth.external_phone_enabled);
    console.log('  hook_send_sms_enabled:', auth.hook_send_sms_enabled);
    console.log('  hook_send_sms_uri:', auth.hook_send_sms_uri);
  }
}

if (otpRes.ok) {
  console.log('\n✅ OTP запрос принят — проверьте SMS на', phone);
}
