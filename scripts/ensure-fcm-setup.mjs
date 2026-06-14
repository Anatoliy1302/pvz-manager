/**
 * Проверяет готовность FCM / Android push для Expo + Supabase.
 * Запуск: node scripts/ensure-fcm-setup.mjs
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const expo = appJson.expo ?? {};

const checks = [];

function ok(label, detail) {
  checks.push({ ok: true, label, detail });
}

function fail(label, detail) {
  checks.push({ ok: false, label, detail });
}

const googleServicesRoot = path.join(root, 'google-services.json');
if (fs.existsSync(googleServicesRoot)) {
  ok('google-services.json в корне', googleServicesRoot);
} else {
  fail('google-services.json в корне', 'Скачайте из Firebase Console → Project settings → Your apps');
}

const configuredPath = expo.android?.googleServicesFile;
if (configuredPath === './google-services.json') {
  ok('app.json → android.googleServicesFile', configuredPath);
} else {
  fail('app.json → android.googleServicesFile', `Сейчас: ${configuredPath ?? 'не задан'}`);
}

try {
  const gs = JSON.parse(fs.readFileSync(googleServicesRoot, 'utf8'));
  const pkg = gs.client?.[0]?.client_info?.android_client_info?.package_name;
  const expected = expo.android?.package;
  if (pkg === expected) {
    ok('Package name совпадает', pkg);
  } else {
    fail('Package name совпадает', `Firebase: ${pkg ?? '?'} / app.json: ${expected ?? '?'}`);
  }
} catch {
  fail('google-services.json валиден', 'Не удалось прочитать JSON');
}

const nativeGoogleServices = path.join(root, 'android/app/google-services.json');
if (fs.existsSync(nativeGoogleServices)) {
  ok('android/app/google-services.json', 'Скопирован prebuild-ом');
} else {
  fail('android/app/google-services.json', 'Запустите: npx expo prebuild --platform android --clean');
}

const appGradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
if (appGradle.includes("com.google.gms.google-services")) {
  ok('Gradle plugin google-services', 'Подключён в android/app/build.gradle');
} else {
  fail('Gradle plugin google-services', 'Запустите prebuild после app.json');
}

const projectId = expo.extra?.eas?.projectId;
if (projectId) {
  ok('EAS projectId', projectId);
} else {
  fail('EAS projectId', 'Задайте expo.extra.eas.projectId');
}

const edgeFn = path.join(root, 'supabase/functions/send-push-notification/index.ts');
if (fs.existsSync(edgeFn)) {
  ok('Edge Function send-push-notification', 'Исходник на месте');
} else {
  fail('Edge Function send-push-notification', 'Файл не найден');
}

console.log('\n=== FCM / Push readiness ===\n');
for (const item of checks) {
  console.log(`${item.ok ? '✓' : '✗'} ${item.label}`);
  console.log(`  ${item.detail}\n`);
}

const failed = checks.filter((c) => !c.ok).length;
if (failed === 0) {
  console.log('Локальная конфигурация OK.\n');
} else {
  console.log(`Нужно исправить: ${failed} пункт(ов).\n`);
}

console.log('Ручные шаги (без автоматизации):');
console.log('  1. Firebase Console → Service accounts → Generate new private key (JSON)');
console.log('  2. eas credentials → Android → Google Service Account Key For FCM V1');
console.log('  3. node supabase/setup/deploy-send-push-notification.mjs');
console.log('  4. npm run build:preview:android  (новый APK, не Expo Go)');
console.log('  5. Войти в приложение → проверить user_push_tokens в Supabase\n');

const whoami = spawnSync('npx', ['eas-cli', 'whoami'], { encoding: 'utf8', shell: true });
if (whoami.status === 0) {
  console.log('EAS login:', whoami.stdout.trim().split('\n').pop());
} else {
  console.log('EAS login: не выполнен (npx eas-cli login)');
}

process.exit(failed > 0 ? 1 : 0);
