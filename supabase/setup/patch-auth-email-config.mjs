/**
 * Завершить настройку email hook через Management API (без supabase secrets CLI).
 * Секреты функции задаются отдельно через CLI или Dashboard.
 */
import fs from 'fs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-auth-email`;

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].trim();
  return value.length > 0 ? value : undefined;
}

function loadAccessToken() {
  const mcp = JSON.parse(fs.readFileSync('.cursor/mcp.json', 'utf8'));
  return mcp.mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN.trim();
}

const accessToken = loadAccessToken();
const smtpPass = loadEnv('NOTISEND_SMTP_PASSWORD');
const smtpUser = loadEnv('NOTISEND_SMTP_USER') ?? 'krv_kravec@mail.ru';
const fromEmail = loadEnv('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru';
const hookSecret = loadEnv('SEND_EMAIL_HOOK_SECRET');

if (!smtpPass) {
  console.error('NOTISEND_SMTP_PASSWORD missing in .env');
  process.exit(1);
}
if (!hookSecret) {
  console.error('SEND_EMAIL_HOOK_SECRET missing — run configure-auth-email-hook.mjs first');
  process.exit(1);
}

const authPatch = {
  hook_send_email_enabled: true,
  hook_send_email_uri: HOOK_URL,
  hook_send_email_secrets: hookSecret,
  smtp_host: 'smtp.msndr.net',
  smtp_port: '465',
  smtp_user: smtpUser,
  smtp_pass: smtpPass,
  smtp_admin_email: fromEmail,
  smtp_sender_name: 'PVZ Personal',
  mailer_autoconfirm: true,
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
};

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
  console.error('PATCH failed:', response.status, text.slice(0, 400));
  process.exit(1);
}

const result = JSON.parse(text);
console.log('Auth email configured.');
console.log('  hook enabled:', result.hook_send_email_enabled);
console.log('  hook uri:', result.hook_send_email_uri);
console.log('  smtp host:', result.smtp_host);
console.log('  from:', result.smtp_admin_email);
