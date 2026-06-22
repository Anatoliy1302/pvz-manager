/**
 * Синхронизирует SEND_SMS_HOOK_SECRET между .env, Edge Function secrets и Auth hook config.
 * Run: node supabase/setup/sync-sms-hook-secret.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import { loadAccessToken } from './loadAccessToken.mjs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-sms`;

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const hookSecret = process.env.SEND_SMS_HOOK_SECRET ?? loadEnv('SEND_SMS_HOOK_SECRET');
if (!hookSecret) {
  console.error('SEND_SMS_HOOK_SECRET не найден в .env');
  process.exit(1);
}

const token = loadAccessToken();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN не найден');
  process.exit(1);
}

console.log('Setting Edge Function secret SEND_SMS_HOOK_SECRET...');
const secretResult = spawnSync(
  'npx',
  ['supabase', 'secrets', 'set', `SEND_SMS_HOOK_SECRET=${hookSecret}`, '--project-ref', PROJECT_REF],
  { stdio: 'inherit', shell: true }
);
if (secretResult.status !== 0) {
  process.exit(secretResult.status ?? 1);
}

console.log('Patching Auth hook_send_sms_secrets...');
const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    hook_send_sms_enabled: true,
    hook_send_sms_uri: HOOK_URL,
    hook_send_sms_secrets: hookSecret,
  }),
});

const text = await response.text();
if (!response.ok) {
  console.error('Auth PATCH failed:', response.status, text.slice(0, 500));
  process.exit(1);
}

console.log('✅ Hook secret synced.');
console.log(`   URL: ${HOOK_URL}`);
console.log('\nПроверка: node supabase/setup/test-phone-otp.mjs +79143288207');
