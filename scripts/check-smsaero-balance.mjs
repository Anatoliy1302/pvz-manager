import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const password = process.env.DEPLOY_SSH_PASSWORD;
if (!password) {
  console.error('Set DEPLOY_SSH_PASSWORD');
  process.exit(1);
}

function run(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', (d) => {
        out += d;
      });
      stream.stderr.on('data', (d) => {
        out += d;
      });
      stream.on('close', (code) => {
        if (code !== 0) reject(new Error(out));
        else resolve(out);
      });
    });
  });
}

function uploadFile(sftp, localPath, remoteFile) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remoteFile, (err) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
}

const localScript = path.join(__dirname, 'check-smsaero-on-vps.js');
const remoteScript = '/tmp/check-smsaero-on-vps.js';

const conn = new Client();
conn.on('ready', () => {
  conn.sftp(async (err, sftp) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    try {
      await uploadFile(sftp, localScript, remoteScript);
      console.log(await run(conn, `cd /opt/pvz && node ${remoteScript}`));
      conn.end();
    } catch (e) {
      console.error(e.message);
      conn.end();
      process.exit(1);
    }
  });
});
conn.connect({ host: '79.137.192.194', username: 'root', password });
