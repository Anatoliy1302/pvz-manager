/**
 * Проверка, занят ли email в Supabase Auth.
 * Run: node supabase/setup/check-owner-email.mjs moda_gorod_vl@mail.ru
 */
import fs from 'fs';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const baseUrl = (loadEnv('EXPO_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const apiKey = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || loadEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const email = (process.argv[2] || '').trim().toLowerCase();

if (!baseUrl || !apiKey || !email) {
  console.error('Usage: node supabase/setup/check-owner-email.mjs <email>');
  process.exit(1);
}

const res = await fetch(`${baseUrl}/rest/v1/rpc/check_owner_email_exists`, {
  method: 'POST',
  headers: {
    apikey: apiKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ p_email: email }),
});

const text = await res.text();
console.log('email:', email);
console.log('status:', res.status);
console.log('registered in auth.users:', text);
