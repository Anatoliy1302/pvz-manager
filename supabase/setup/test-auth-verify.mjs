/**
 * Проверка POST /auth/v1/verify (без реального OTP — только формат ответа).
 */
import fs from 'fs';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match ? match[1].trim() : undefined;
}

const baseUrl = (loadEnv('EXPO_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const apiKey = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || loadEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');

if (!baseUrl || !apiKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or key in .env');
  process.exit(1);
}

const testEmail = process.argv[2] || 'test-verify@users.pvzpersonal.ru';
const testToken = process.argv[3] || '000000';

for (const type of ['email', 'magiclink', 'signup']) {
  const res = await fetch(`${baseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ email: testEmail, token: testToken, type }),
  });
  const text = await res.text();
  console.log(`type=${type} status=${res.status} body=${text.slice(0, 180)}`);
}

const health = await fetch(`${baseUrl}/auth/v1/health`, { headers: { apikey: apiKey } });
console.log(`health status=${health.status}`);
