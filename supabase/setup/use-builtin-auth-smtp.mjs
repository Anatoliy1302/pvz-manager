/** Отключить Send Email Hook — использовать встроенный Supabase SMTP. */
import fs from 'fs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';

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

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    hook_send_email_enabled: false,
    smtp_host: 'smtp.msndr.net',
    smtp_port: '587',
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    smtp_admin_email: fromEmail,
    smtp_sender_name: 'PVZ Personal',
    mailer_autoconfirm: true,
    mailer_otp_length: 6,
  }),
});

const text = await response.text();
if (!response.ok) {
  console.error('PATCH failed:', response.status, text.slice(0, 400));
  process.exit(1);
}

console.log('Built-in SMTP enabled, email hook disabled.');
