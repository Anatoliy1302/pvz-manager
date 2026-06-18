/**
 * Upload legal/*.html to Reg.ru hosting via FTPS.
 *
 * Required in .env:
 *   LEGAL_SITE_FTP_HOST=ftp.pvzpersonal.ru   (or server host from Reg.ru panel)
 *   LEGAL_SITE_FTP_USER=u1234567
 *   LEGAL_SITE_FTP_PASSWORD=...
 *
 * Optional:
 *   LEGAL_SITE_FTP_REMOTE_DIR=/www/pvzpersonal.ru/public_html
 *
 * Run: node scripts/deploy-legal-site-ftp.mjs
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'basic-ftp';

const ROOT = process.cwd();

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env not found');
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const get = (key) => raw.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim();
  return get;
}

const get = loadEnv();

const host = get('LEGAL_SITE_FTP_HOST');
const user = get('LEGAL_SITE_FTP_USER');
const password = get('LEGAL_SITE_FTP_PASSWORD');
const remoteDir = get('LEGAL_SITE_FTP_REMOTE_DIR') ?? '/';

if (!host || !user || !password) {
  console.error(
    'Missing LEGAL_SITE_FTP_HOST, LEGAL_SITE_FTP_USER or LEGAL_SITE_FTP_PASSWORD in .env'
  );
  process.exit(1);
}

const uploads = [
  { local: 'legal/privacy.html', remote: 'privacy/index.html' },
  { local: 'legal/terms.html', remote: 'terms/index.html' },
  { local: 'legal/consent.html', remote: 'consent/index.html' },
];

const client = new Client(60_000);
client.ftp.verbose = process.env.FTP_VERBOSE === '1';

try {
  console.log(`Connecting to ${host} ...`);
  await client.access({
    host,
    user,
    password,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  });

  await client.ensureDir(remoteDir.replace(/\/$/, ''));
  await client.cd(remoteDir.replace(/\/$/, ''));

  for (const { local, remote } of uploads) {
    const localPath = path.join(ROOT, local);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Missing ${localPath}`);
    }
    const remoteDirPath = path.posix.dirname(remote);
    if (remoteDirPath !== '.') {
      await client.ensureDir(remoteDirPath);
    }
    console.log(`Uploading ${local} -> ${remote}`);
    await client.uploadFrom(localPath, remote);
  }

  console.log('\nLegal pages uploaded.');
  console.log('Check:');
  console.log('  https://pvzpersonal.ru/privacy');
  console.log('  https://pvzpersonal.ru/terms');
  console.log('  https://pvzpersonal.ru/consent');
} finally {
  client.close();
}
