/**
 * Deploy send-sms + включить Send SMS Hook и Phone provider в Supabase Auth.
 *
 * Перед запуском (опционально, если секреты ещё не в Supabase):
 *   SMS_AERO_LOGIN=email@example.com
 *   SMS_AERO_SECRET=api_key_from_smsaero
 *   SEND_SMS_HOOK_SECRET=v1,whsec_...  (из .env или сгенерируется)
 *   SUPABASE_ACCESS_TOKEN=sbp_...       (Dashboard → Access Tokens)
 *
 * Run: node supabase/setup/configure-auth-sms-hook.mjs
 */
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import { loadAccessToken } from './loadAccessToken.mjs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const HOOK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/send-sms`;

function run(cmd, args, { inherit = true, shell = false } = {}) {
  const safeLog = args.map((arg) =>
    /^(SMS_AERO_SECRET|SEND_SMS_HOOK_SECRET|SUPABASE_ACCESS_TOKEN)=/.test(arg)
      ? `${arg.split('=')[0]}=[redacted]`
      : arg
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
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
  return result.stdout ?? '';
}

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].trim();
  return value.length > 0 ? value : undefined;
}

function quoteSecret(value) {
  if (/[\s#,]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

let hookSecret = process.env.SEND_SMS_HOOK_SECRET ?? loadEnv('SEND_SMS_HOOK_SECRET');
if (!hookSecret) {
  hookSecret = `v1,whsec_${crypto.randomBytes(32).toString('base64')}`;
  console.log('Сгенерирован SEND_SMS_HOOK_SECRET — сохраните в .env');
}

run(
  'npx',
  ['supabase', 'functions', 'deploy', 'send-sms', '--project-ref', PROJECT_REF, '--no-verify-jwt'],
  { shell: true }
);

const smsLogin = process.env.SMS_AERO_LOGIN ?? process.env.SMS_AERO_EMAIL ?? loadEnv('SMS_AERO_LOGIN') ?? loadEnv('SMS_AERO_EMAIL');
const smsSecret = process.env.SMS_AERO_SECRET ?? process.env.SMS_AERO_API_KEY ?? loadEnv('SMS_AERO_SECRET') ?? loadEnv('SMS_AERO_API_KEY');

const secretPairs = [
  ['SEND_SMS_HOOK_SECRET', hookSecret],
  ['SMS_AERO_SIGN', 'SMS Aero'],
  ['SMS_AERO_MESSAGE_TEMPLATE', 'Код PVZ Personal: {code}'],
];
if (smsLogin && smsSecret) {
  secretPairs.unshift(
    ['SMS_AERO_LOGIN', smsLogin],
    ['SMS_AERO_SECRET', smsSecret],
    ['SMS_AERO_EMAIL', smsLogin],
    ['SMS_AERO_API_KEY', smsSecret],
  );
} else {
  console.log('SMS_AERO_LOGIN/SECRET не в .env — используем секреты, уже заданные в Supabase.');
}

for (const [name, value] of secretPairs) {
  run('npx', ['supabase', 'secrets', 'set', `${name}=${quoteSecret(value)}`, '--project-ref', PROJECT_REF], {
    shell: true,
  });
}

const accessToken = loadAccessToken();
if (!accessToken) {
  console.log('\nSUPABASE_ACCESS_TOKEN не задан — пробуем supabase config push...');
  run('npx', ['supabase', 'config', 'push', '--project-ref', PROJECT_REF, '--yes'], {
    shell: true,
  });
  console.log('\nПроверьте Dashboard → Authentication → Hooks → Send SMS.');
  console.log(`URL: ${HOOK_URL}`);
  process.exit(0);
}

const authPatch = {
  external_phone_enabled: true,
  sms_autoconfirm: true,
  sms_otp_length: 6,
  sms_otp_exp: 3600,
  hook_send_sms_enabled: true,
  hook_send_sms_uri: HOOK_URL,
  hook_send_sms_secrets: hookSecret,
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
  console.log('\nПробуем supabase config push как запасной вариант...');
  run('npx', ['supabase', 'config', 'push', '--project-ref', PROJECT_REF, '--yes'], {
    shell: true,
  });
  process.exit(response.ok ? 0 : 1);
}

console.log('\nSend SMS Hook включён.');
console.log(`  URL: ${HOOK_URL}`);
console.log('  Phone provider: enabled');
console.log('\nПроверка: Сотрудник/Админ → телефон → запросите SMS-код.');
