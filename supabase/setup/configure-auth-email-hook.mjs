/**
 * Deploy send-auth-email + включить Send Email Hook в Supabase Auth.
 *
 * Перед запуском добавьте в .env:
 *   NOTISEND_SMTP_PASSWORD=<API-ключ из NotiSend → Параметры подключения и SMTP>
 * Опционально:
 *   NOTISEND_SMTP_USER=krv_kravec@mail.ru
 *   NOTISEND_FROM_EMAIL=noreply@pvzpersonal.ru
 *   SEND_EMAIL_HOOK_SECRET=v1,whsec_...  (сгенерируется автоматически)
 *
 * Run: node supabase/setup/configure-auth-email-hook.mjs
 */
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-auth-email`;

function run(cmd, args, { inherit = true, shell = false } = {}) {
  const safeLog = args.map((arg) =>
    /^(NOTISEND_SMTP_PASSWORD|NOTISEND_API_KEY|SEND_EMAIL_HOOK_SECRET)=/.test(arg)
      ? `${arg.split('=')[0]}=[redacted]`
      : arg,
  );
  console.log(`> ${cmd} ${safeLog.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: inherit ? 'inherit' : 'pipe',
    shell,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (combined.includes('Finished supabase secrets set')) {
      console.warn('secrets set: завершено (PostHog timeout игнорируется)');
      return result.stdout ?? '';
    }
    if (combined.includes('PostHog') && combined.includes('secrets set')) {
      console.warn('secrets set: CLI timeout (PostHog), проверьте secrets в Dashboard');
      return result.stdout ?? '';
    }
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
  return result.stdout ?? '';
}

function loadAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
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
const authRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
});
const authConfig = await authRes.json();

let notisendPassword =
  process.env.NOTISEND_SMTP_PASSWORD || loadEnv('NOTISEND_SMTP_PASSWORD') || authConfig.smtp_pass;

if (!notisendPassword) {
  console.error(
    'NOTISEND_SMTP_PASSWORD не найден.\n' +
      '1. NotiSend → Параметры подключения и SMTP → скопируйте API-ключ\n' +
      '2. Добавьте в .env: NOTISEND_SMTP_PASSWORD=ваш_ключ\n' +
      '3. Запустите снова: node supabase/setup/configure-auth-email-hook.mjs'
  );
  process.exit(1);
}

const smtpUser =
  process.env.NOTISEND_SMTP_USER ??
  loadEnv('NOTISEND_SMTP_USER') ??
  authConfig.smtp_user ??
  'krv_kravec@mail.ru';
const fromEmail =
  process.env.NOTISEND_FROM_EMAIL ??
  loadEnv('NOTISEND_FROM_EMAIL') ??
  authConfig.smtp_admin_email ??
  'noreply@pvzpersonal.ru';

let hookSecret = process.env.SEND_EMAIL_HOOK_SECRET ?? loadEnv('SEND_EMAIL_HOOK_SECRET');
if (!hookSecret) {
  hookSecret = `v1,whsec_${crypto.randomBytes(32).toString('base64')}`;
  console.log('Сгенерирован SEND_EMAIL_HOOK_SECRET (сохраните в .env при необходимости)');
}

run(
  'npx',
  [
    'supabase',
    'functions',
    'deploy',
    'send-auth-email',
    '--project-ref',
    PROJECT_REF,
    '--no-verify-jwt',
  ],
  { shell: true },
);

const secretArgs = [
  'supabase',
  'secrets',
  'set',
  `NOTISEND_SMTP_USER=${smtpUser}`,
  `NOTISEND_SMTP_PASSWORD=${notisendPassword}`,
  `NOTISEND_API_KEY=${notisendPassword}`,
  'NOTISEND_SMTP_HOST=smtp.msndr.net',
  'NOTISEND_SMTP_PORT=465',
  `NOTISEND_FROM_EMAIL=${fromEmail}`,
  'NOTISEND_FROM_NAME=PVZ Personal',
  `SEND_EMAIL_HOOK_SECRET=${hookSecret}`,
  '--project-ref',
  PROJECT_REF,
];
run('npx', secretArgs);

const authPatch = {
  hook_send_email_enabled: true,
  hook_send_email_uri: HOOK_URL,
  hook_send_email_secrets: hookSecret,
  smtp_host: 'smtp.msndr.net',
  smtp_port: '465',
  smtp_user: smtpUser,
  smtp_pass: notisendPassword,
  smtp_admin_email: fromEmail,
  smtp_sender_name: 'PVZ Personal',
  mailer_autoconfirm: true,
  mailer_otp_length: 6,
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
  console.error('Auth config PATCH failed:', response.status, text.slice(0, 500));
  process.exit(1);
}

console.log('\nSend Email Hook включён.');
console.log(`  URL: ${HOOK_URL}`);
console.log(`  From: ${fromEmail}`);
console.log(`  SMTP user: ${smtpUser}`);
console.log('\nПроверка: запросите код в приложении (Владелец → email).');
