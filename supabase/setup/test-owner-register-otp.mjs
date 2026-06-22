/**
 * Диагностика регистрации владельца: send OTP + verify (email vs signup).
 * Run: node supabase/setup/test-owner-register-otp.mjs <email> [code]
 */
import fs from 'fs';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const base = (loadEnv('EXPO_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const key = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const email = (process.argv[2] || `owner-reg-${Date.now()}@users.pvzpersonal.ru`).trim().toLowerCase();
const code = (process.argv[3] || '').replace(/\D/g, '');

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, text };
}

if (!code) {
  console.log('1. Send OTP (create_user, type=email, role=owner)');
  const send = await post('/auth/v1/otp', {
    email,
    create_user: true,
    type: 'email',
    data: { role: 'owner' },
  });
  console.log('   status:', send.status, send.json.error_code || send.json.msg || 'ok');

  const signup = await post('/auth/v1/signup', {
    email,
    password: 'TempPass123!',
    data: { role: 'owner' },
  });
  console.log('2. signup probe (user exists?):', signup.status, signup.json.error_code || signup.json.msg || 'created');

  console.log('\nПосле письма:');
  console.log(`  node supabase/setup/test-owner-register-otp.mjs ${email} <CODE>`);
  process.exit(send.status >= 400 ? 1 : 0);
}

console.log('Verify', email, 'code', code);
for (const type of ['email', 'signup', 'magiclink']) {
  const v = await post('/auth/v1/verify', { email, token: code, type });
  const ok = v.status >= 200 && v.status < 300;
  console.log(
    `  type=${type} → ${v.status}`,
    ok ? `user=${v.json.user?.id}` : v.json.error_code || v.json.msg
  );
  if (ok && v.json.access_token) {
    const token = v.json.access_token;
    const rpc = await fetch(`${base}/rest/v1/rpc/ensure_owner_profile_for_login`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_email: email }),
    });
    console.log('  RPC ensure_owner_profile:', rpc.status, (await rpc.text()).slice(0, 120));

    const prof = await fetch(`${base}/rest/v1/profiles?select=id,role,email&id=eq.${v.json.user?.id}`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    console.log('  profile:', await prof.text());
  }
}
