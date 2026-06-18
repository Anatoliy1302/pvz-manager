/** PATCH auth SMTP — password из .env, без вывода секретов. */
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

const smtpPass = loadEnv('NOTISEND_SMTP_PASSWORD');
if (!smtpPass) {
  console.error('NOTISEND_SMTP_PASSWORD missing');
  process.exit(1);
}

const patch = {
  hook_send_email_enabled: false,
  hook_send_email_uri: null,
  hook_send_email_secrets: null,
  smtp_host: 'smtp.msndr.net',
  smtp_port: process.argv[2] ?? '587',
  smtp_user: loadEnv('NOTISEND_SMTP_USER') ?? 'krv_kravec@mail.ru',
  smtp_pass: smtpPass,
  smtp_admin_email: loadEnv('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru',
  smtp_sender_name: 'PVZ Personal',
  mailer_autoconfirm: true,
  mailer_otp_length: 6,
};

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${loadAccessToken()}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(patch),
});

if (!response.ok) {
  console.error('PATCH failed:', response.status, (await response.text()).slice(0, 300));
  process.exit(1);
}

console.log('SMTP patched, port', patch.smtp_port);
