/**
 * Проверяет готовность EAS-сборки и выводит недостающие шаги.
 * Запуск: node scripts/ensure-eas-env.mjs
 */
import fs from 'fs';
import { spawnSync } from 'child_process';

const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const projectId = appJson?.expo?.extra?.eas?.projectId;

console.log('EAS project:', projectId ?? 'MISSING — run: npx eas init');

const requiredSecrets = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

console.log('\nRequired EAS env vars for preview/production builds:');
for (const name of requiredSecrets) {
  console.log(`  - ${name}`);
}
console.log('  - EXPO_PUBLIC_USE_SUPABASE_PHONE_OTP (set in eas.json env for preview/production)');
console.log('  - EXPO_PUBLIC_DEMO_MODE (optional, local dev without Supabase OTP — demo data only)');

console.log('\nPush from local .env:');
console.log('  npm run eas:secrets:push');

console.log('\nOr set manually:');
console.log('  eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://..." --environment preview --environment production');
console.log('  eas env:create --scope project --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "sb_publishable_..." --environment preview --environment production --visibility sensitive');

const whoami = spawnSync('npx', ['eas-cli', 'whoami'], { encoding: 'utf8', shell: true });
if (whoami.status === 0) {
  console.log('\nLogged in as:', whoami.stdout.trim().split('\n').pop());
} else {
  console.log('\nNot logged in — run: npx eas-cli login');
}

console.log('\nAndroid FCM (push notifications):');
console.log('  npm run fcm:check');
console.log('  Firebase → Service accounts → private key JSON → eas credentials (FCM V1)');
console.log('  npm run deploy:push');

console.log('\nPreview Android build:');
console.log('  npm run build:preview:android');
