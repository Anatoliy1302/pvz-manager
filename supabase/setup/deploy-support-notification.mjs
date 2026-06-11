/**
 * Деплой support-notification: функция + секреты + конфиг в БД.
 *
 * Требует в .env:
 *   SUPABASE_DB_PASSWORD
 *   SUPPORT_WEBHOOK_SECRET  (совпадает с WEBHOOK_SECRET в Supabase)
 *   SMTP_PASSWORD           (пароль приложения Mail.ru)
 *
 * Опционально:
 *   SMTP_USER, SUPPORT_EMAIL_TO
 *
 * Запуск: node supabase/setup/deploy-support-notification.mjs
 */
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env not found');
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const get = (key) => raw.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();

  const password = get('SUPABASE_DB_PASSWORD');
  if (!password) throw new Error('SUPABASE_DB_PASSWORD missing in .env');

  let webhookSecret = get('SUPPORT_WEBHOOK_SECRET');
  if (!webhookSecret) {
    webhookSecret = crypto.randomBytes(32).toString('hex');
    fs.appendFileSync(envPath, `\nSUPPORT_WEBHOOK_SECRET=${webhookSecret}\n`);
    console.log('Generated SUPPORT_WEBHOOK_SECRET and appended to .env');
  }

  const smtpPassword = get('SMTP_PASSWORD');
  if (!smtpPassword) {
    throw new Error(
      'SMTP_PASSWORD missing in .env — добавьте пароль приложения Mail.ru'
    );
  }

  return {
    webhookSecret,
    smtpPassword,
    smtpUser: get('SMTP_USER') ?? 'razrabotka_vl@mail.ru',
    supportEmailTo: get('SUPPORT_EMAIL_TO') ?? get('SMTP_USER') ?? 'razrabotka_vl@mail.ru',
  };
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
  }
}

const env = loadEnv();

run('npx', ['supabase', 'functions', 'deploy', 'support-notification', '--project-ref', PROJECT_REF]);

const secrets = [
  `SMTP_PASSWORD=${env.smtpPassword}`,
  `WEBHOOK_SECRET=${env.webhookSecret}`,
  `SMTP_USER=${env.smtpUser}`,
  `SUPPORT_EMAIL_TO=${env.supportEmailTo}`,
];

for (const secret of secrets) {
  run('npx', ['supabase', 'secrets', 'set', secret, '--project-ref', PROJECT_REF]);
}

run('node', ['supabase/setup/apply-migration-160000.mjs']);
run('node', ['supabase/setup/apply-support-webhook.mjs']);

console.log('\nSupport notification deployed and configured.');
