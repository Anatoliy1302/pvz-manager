/**
 * Деплой server/ на VPS.
 *
 * Локально (из корня репозитория):
 *   DEPLOY_SSH_HOST=79.137.192.194 DEPLOY_SSH_USER=root DEPLOY_SSH_PASSWORD=*** npm run deploy:api
 *
 * Или с SSH-ключом:
 *   DEPLOY_SSH_HOST=... DEPLOY_SSH_USER=root DEPLOY_SSH_KEY=~/.ssh/id_rsa npm run deploy:api
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverRoot = path.join(repoRoot, 'server');
const remotePath = process.env.DEPLOY_PATH || '/opt/pvz';

const host = process.env.DEPLOY_SSH_HOST;
const username = process.env.DEPLOY_SSH_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const privateKeyPath = process.env.DEPLOY_SSH_KEY;

if (!host) {
  console.error('Set DEPLOY_SSH_HOST (and DEPLOY_SSH_PASSWORD or DEPLOY_SSH_KEY)');
  process.exit(1);
}

function collectFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.env') continue;
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, base));
    } else {
      files.push({ local: full, remote: path.join(remotePath, path.relative(base, full)).replace(/\\/g, '/') });
    }
  }
  return files;
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
        if (code !== 0) reject(new Error(`Command failed (${code}): ${cmd}\n${out}`));
        else resolve(out);
      });
    });
  });
}

function uploadFile(sftp, localPath, remoteFile) {
  return new Promise((resolve, reject) => {
    const remoteDir = path.posix.dirname(remoteFile);
    sftp.mkdir(remoteDir, { mode: 0o755 }, () => {
      sftp.fastPut(localPath, remoteFile, (err) => {
        if (err) reject(err);
        else resolve(undefined);
      });
    });
  });
}

const connectConfig = { host, port: Number(process.env.DEPLOY_SSH_PORT || 22), username };
if (privateKeyPath) {
  connectConfig.privateKey = fs.readFileSync(path.resolve(privateKeyPath));
} else if (password) {
  connectConfig.password = password;
} else {
  console.error('Provide DEPLOY_SSH_PASSWORD or DEPLOY_SSH_KEY');
  process.exit(1);
}

const conn = new Client();
conn
  .on('ready', () => {
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      try {
        const files = collectFiles(serverRoot);
        console.log(`Uploading ${files.length} files to ${remotePath}...`);
        await run(conn, `mkdir -p ${remotePath}/src/middleware`);
        for (const file of files) {
          await uploadFile(sftp, file.local, file.remote);
        }

        console.log('Installing dependencies...');
        await run(conn, `cd ${remotePath} && npm install --omit=dev`);

        console.log('Restarting PM2...');
        await run(
          conn,
          `cd ${remotePath} && (pm2 describe pvz-api >/dev/null 2>&1 && pm2 restart pvz-api --update-env || pm2 start ecosystem.config.cjs) && pm2 save`
        );

        console.log('Health check...');
        await run(conn, 'curl -sf http://localhost:3000/ || exit 1');
        console.log('\nDeploy OK');
        conn.end();
      } catch (e) {
        console.error('Deploy failed:', e.message);
        conn.end();
        process.exit(1);
      }
    });
  })
  .on('error', (e) => {
    console.error('SSH error:', e.message);
    process.exit(1);
  })
  .connect({ ...connectConfig, readyTimeout: 30000 });
