/**
 * Синхронизация NotiSend env на VPS (email OTP для владельца).
 * Usage: DEPLOY_SSH_PASSWORD=... node scripts/sync-notisend-env-to-vps.mjs
 */
import fs from 'fs';
import { Client } from 'ssh2';

function loadEnv(name) {
  if (process.env[name]) return process.env[name];
  if (!fs.existsSync('.env')) return undefined;
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^#?\\s*${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const apiKey = loadEnv('NOTISEND_API_KEY') ?? loadEnv('NOTISEND_SMTP_PASSWORD');
const fromEmail = loadEnv('NOTISEND_FROM_EMAIL') ?? 'noreply@pvzpersonal.ru';
const fromName = loadEnv('NOTISEND_FROM_NAME') ?? 'PVZ Personal';
const testMode = loadEnv('EMAIL_TEST_MODE') ?? loadEnv('NOTISEND_TEST_MODE') ?? '0';

const host = process.env.DEPLOY_SSH_HOST || '79.137.192.194';
const username = process.env.DEPLOY_SSH_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const privateKeyPath = process.env.DEPLOY_SSH_KEY;
const remotePath = process.env.DEPLOY_PATH || '/opt/pvz';

if (!apiKey) {
  console.error('Set NOTISEND_API_KEY or NOTISEND_SMTP_PASSWORD in .env');
  process.exit(1);
}
if (!password && !privateKeyPath) {
  console.error('Set DEPLOY_SSH_PASSWORD or DEPLOY_SSH_KEY');
  process.exit(1);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on('data', (d) => {
        out += d;
        process.stderr.write(d);
      });
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(out));
        else resolve(out);
      });
    });
  });
}

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, line);
  }
  return `${content.trim()}\n${line}\n`;
}

const conn = new Client();
conn
  .on('ready', async () => {
    try {
      const envPath = `${remotePath}/server/.env`;
      let remoteEnv = '';
      try {
        remoteEnv = await run(conn, `cat ${shellQuote(envPath)}`);
      } catch {
        remoteEnv = '';
      }

      let next = remoteEnv;
      next = upsertEnv(next, 'NOTISEND_API_KEY', apiKey);
      next = upsertEnv(next, 'NOTISEND_FROM_EMAIL', fromEmail);
      next = upsertEnv(next, 'NOTISEND_FROM_NAME', fromName);
      next = upsertEnv(next, 'EMAIL_TEST_MODE', testMode);

      const encoded = Buffer.from(next, 'utf8').toString('base64');
      await run(conn, `echo ${shellQuote(encoded)} | base64 -d > ${shellQuote(envPath)}`);
      await run(conn, `cd ${shellQuote(remotePath)} && pm2 restart pvz-api --update-env || pm2 restart all --update-env`);
      console.log('\n✓ NotiSend env synced, pvz-api restarted');
      conn.end();
    } catch (error) {
      console.error(error);
      conn.end();
      process.exit(1);
    }
  })
  .connect({
    host,
    port: 22,
    username,
    ...(privateKeyPath ? { privateKey: fs.readFileSync(privateKeyPath) } : { password }),
  });
