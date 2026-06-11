/**
 * Загружает EXPO_PUBLIC_* из .env в EAS environment variables (preview + production).
 * EXPO_PUBLIC_ — только sensitive/plaintext (не secret).
 * Запуск: node scripts/push-eas-secrets.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';

if (!fs.existsSync('.env')) {
  console.error('.env not found');
  process.exit(1);
}

const raw = fs.readFileSync('.env', 'utf8');
const keys = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const environments = ['preview', 'production'];

function runEas(args, { allowFail = false } = {}) {
  const result = spawnSync('npx', ['eas-cli', ...args], {
    stdio: 'inherit',
    shell: true,
  });
  const status = result.status ?? 1;
  if (status !== 0 && !allowFail) {
    process.exit(status);
  }
  return status;
}

for (const key of keys) {
  const match = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match?.[1]?.trim()) {
    console.error(`Missing ${key} in .env`);
    process.exit(1);
  }
  const value = match[1].trim();

  for (const env of environments) {
    console.log(`\n[${env}] ${key}`);

    // Удаляем старую переменную (secret / legacy), если есть
    runEas(
      [
        'env:delete',
        '--variable-name',
        key,
        '--variable-environment',
        env,
        '--scope',
        'project',
        '--non-interactive',
      ],
      { allowFail: true }
    );

    // EXPO_PUBLIC_* — sensitive (рекомендация Expo, не secret)
    runEas([
      'env:create',
      '--scope',
      'project',
      '--name',
      key,
      '--value',
      value,
      '--environment',
      env,
      '--visibility',
      'sensitive',
      '--force',
      '--non-interactive',
    ]);
  }
}

console.log('\nEAS environment variables updated for preview and production.');
