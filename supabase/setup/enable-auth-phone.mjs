/**
 * Включить Phone provider + SMS hook через Management API.
 * Требует SUPABASE_ACCESS_TOKEN в .env (Dashboard → Account → Access Tokens).
 *
 * Run: node supabase/setup/enable-auth-phone.mjs
 */
import fs from 'fs';
import { loadAccessToken, requireAccessToken } from './loadAccessToken.mjs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-sms`;
const EMAIL_HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-auth-email`;

function loadEnv(name) {
  if (!fs.existsSync('.env')) return undefined;
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim() || undefined;
}

const accessToken = requireAccessToken();
const smsHookSecret = process.env.SEND_SMS_HOOK_SECRET ?? loadEnv('SEND_SMS_HOOK_SECRET');
const emailHookSecret = process.env.SEND_EMAIL_HOOK_SECRET ?? loadEnv('SEND_EMAIL_HOOK_SECRET');

if (!smsHookSecret) {
  console.error('SEND_SMS_HOOK_SECRET не найден в .env');
  process.exit(1);
}

const authPatch = {
  external_phone_enabled: true,
  sms_autoconfirm: true,
  sms_otp_length: 6,
  sms_otp_exp: 3600,
  hook_send_sms_enabled: true,
  hook_send_sms_uri: HOOK_URL,
  hook_send_sms_secrets: smsHookSecret,
};

if (emailHookSecret) {
  authPatch.hook_send_email_enabled = true;
  authPatch.hook_send_email_uri = EMAIL_HOOK_URL;
  authPatch.hook_send_email_secrets = emailHookSecret;
  authPatch.mailer_autoconfirm = true;
  authPatch.mailer_otp_length = 6;
}

const getRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
});
const current = await getRes.json();
if (!getRes.ok) {
  console.error('GET auth config failed:', getRes.status, JSON.stringify(current).slice(0, 300));
  process.exit(1);
}

console.log('Current:');
console.log('  external_phone_enabled:', current.external_phone_enabled);
console.log('  hook_send_sms_enabled:', current.hook_send_sms_enabled);
console.log('  hook_send_sms_uri:', current.hook_send_sms_uri);

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(authPatch),
});

const text = await response.text();
if (!response.ok) {
  console.error('PATCH failed:', response.status, text.slice(0, 500));
  process.exit(1);
}

console.log('\nOK: Phone provider + SMS hook включены.');
console.log(`  SMS hook: ${HOOK_URL}`);
