/**
 * Включает Send Email Hook (функция send-auth-email должна быть задеплоена).
 * Секреты задаются отдельно: npm run deploy:auth-email
 */
import crypto from 'crypto';
import fs from 'fs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-auth-email`;

function loadAccessToken() {
  const mcp = JSON.parse(fs.readFileSync('.cursor/mcp.json', 'utf8'));
  return mcp.mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN.trim();
}

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].trim();
  return value.length > 0 ? value : undefined;
}

const accessToken = loadAccessToken();
let hookSecret = process.env.SEND_EMAIL_HOOK_SECRET || loadEnv('SEND_EMAIL_HOOK_SECRET');
if (!hookSecret) {
  hookSecret = `v1,whsec_${crypto.randomBytes(32).toString('base64')}`;
  console.log('Сгенерирован SEND_EMAIL_HOOK_SECRET — добавьте в .env и в secrets функции.');
}

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    hook_send_email_enabled: true,
    hook_send_email_uri: HOOK_URL,
    hook_send_email_secrets: hookSecret,
    mailer_autoconfirm: true,
    mailer_otp_length: 6,
  }),
});

const text = await response.text();
if (!response.ok) {
  console.error('Failed:', response.status, text.slice(0, 300));
  process.exit(1);
}

console.log('Send Email Hook enabled:', HOOK_URL);
