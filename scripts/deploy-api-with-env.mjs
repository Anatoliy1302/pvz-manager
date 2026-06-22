/**
 * Loads DEPLOY_* from repo .env and runs deploy-api.mjs (no secrets logged).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
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

if (!process.env.DEPLOY_SSH_HOST) {
  process.env.DEPLOY_SSH_HOST = '79.137.192.194';
}
if (!process.env.DEPLOY_SSH_USER) {
  process.env.DEPLOY_SSH_USER = 'root';
}

const result = spawnSync(process.execPath, [path.join(__dirname, 'deploy-api.mjs')], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
