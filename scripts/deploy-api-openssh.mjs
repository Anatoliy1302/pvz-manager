/**
 * Деплой server/ на VPS через системный scp/ssh (без пакета ssh2).
 * Загружает DEPLOY_* из .env (как deploy-api-with-env.mjs).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverRoot = path.join(repoRoot, 'server');
const envPath = path.join(repoRoot, '.env');

function loadDeployEnv() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key.startsWith('DEPLOY_')) {
      process.env[key] = value;
    }
  }
}

loadDeployEnv();

const host = process.env.DEPLOY_SSH_HOST || '79.137.192.194';
const username = process.env.DEPLOY_SSH_USER || 'root';
const remotePath = process.env.DEPLOY_PATH || '/opt/pvz';
const keyPath = process.env.DEPLOY_SSH_KEY;
const port = process.env.DEPLOY_SSH_PORT || '22';

if (!keyPath) {
  console.error('DEPLOY_SSH_KEY required for OpenSSH deploy (password auth needs ssh2: npm install ssh2)');
  process.exit(1);
}

const resolvedKey = path.resolve(keyPath.replace(/^~(?=\/|\\)/, os.homedir()));
if (!fs.existsSync(resolvedKey)) {
  console.error(`SSH key not found: ${resolvedKey}`);
  process.exit(1);
}

const sshBase = [
  'ssh',
  '-i',
  resolvedKey,
  '-p',
  port,
  '-o',
  'StrictHostKeyChecking=accept-new',
  '-o',
  'BatchMode=yes',
];

const scpBase = [
  'scp',
  '-i',
  resolvedKey,
  '-P',
  port,
  '-o',
  'StrictHostKeyChecking=accept-new',
  '-o',
  'BatchMode=yes',
];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const target = `${username}@${host}`;
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'pvz-deploy-'));
const archive = path.join(staging, 'server.tgz');

console.log('Packing server/ (without node_modules, .env)...');
run('tar', [
  '-czf',
  archive,
  '--exclude=node_modules',
  '--exclude=.env',
  '-C',
  serverRoot,
  '.',
]);

console.log(`Uploading to ${host}:${remotePath}...`);
run(sshBase[0], [...sshBase.slice(1), target, `mkdir -p ${remotePath}`]);
run(scpBase[0], [...scpBase.slice(1), archive, `${target}:${remotePath}/server.tgz`]);

const remoteScript = [
  `cd ${remotePath}`,
  'tar -xzf server.tgz',
  'rm -f server.tgz',
  'npm install --omit=dev',
  'if pm2 describe pvz-api >/dev/null 2>&1; then pm2 restart pvz-api --update-env; else pm2 start ecosystem.config.cjs; fi',
  'pm2 save',
  'curl -sf http://localhost:3000/',
].join(' && ');

console.log('Installing dependencies and restarting PM2...');
run(sshBase[0], [...sshBase.slice(1), target, remoteScript]);

try {
  fs.rmSync(staging, { recursive: true, force: true });
} catch {
  // ignore cleanup errors
}

console.log('\nDeploy OK');
