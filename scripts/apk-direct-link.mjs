/**
 * Прямая ссылка на APK (eascdn.net), обходя страницу expo.dev.
 * Ссылка действует ~15 минут.
 *
 * npm run apk:link
 * npm run apk:link -- --build-id <uuid>
 */
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
const buildIdIndex = args.indexOf('--build-id');
const buildId = buildIdIndex >= 0 ? args[buildIdIndex + 1] : null;

function runEas(args) {
  const result = spawnSync('npx', ['eas-cli', ...args], {
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function getLatestAndroidBuildId() {
  const out = runEas(['build:list', '--platform', 'android', '--status', 'finished', '--limit', '1', '--json', '--non-interactive']);
  const builds = JSON.parse(out);
  const id = builds[0]?.id;
  if (!id) {
    console.error('Нет завершённых Android-сборок. Сначала: npm run build:preview:android');
    process.exit(1);
  }
  return id;
}

async function resolveDirectUrl(artifactUrl) {
  const response = await fetch(artifactUrl, { method: 'HEAD', redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Не удалось получить APK (${response.status})`);
  }
  return response.url;
}

const id = buildId ?? getLatestAndroidBuildId();
const buildJson = JSON.parse(runEas(['build:view', id, '--json']));
const artifactUrl = buildJson?.artifacts?.buildUrl;

if (!artifactUrl) {
  console.error('У сборки нет APK-артефакта.');
  process.exit(1);
}

const directUrl = await resolveDirectUrl(artifactUrl);

console.log('\nПрямая ссылка на APK (eascdn.net, ~15 мин):\n');
console.log(directUrl);
console.log('\nСборка:', id);
console.log('Версия:', buildJson.appVersion, `(${buildJson.appBuildVersion})`);
console.log('\nКак установить:');
console.log('  1. Откройте ссылку в браузере телефона (часто работает без VPN).');
console.log('  2. Или скачайте на ПК и передайте через Telegram / USB.');
console.log('  3. Повторить ссылку: npm run apk:link');
