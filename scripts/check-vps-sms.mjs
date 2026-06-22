/**
 * Диагностика SMS на VPS (не коммитить с паролем).
 * Usage: DEPLOY_SSH_PASSWORD=... node scripts/check-vps-sms.mjs
 */
import fs from 'fs';
import { Client } from 'ssh2';

const host = process.env.DEPLOY_SSH_HOST || '79.137.192.194';
const username = process.env.DEPLOY_SSH_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const privateKeyPath = process.env.DEPLOY_SSH_KEY;

if (!password && !privateKeyPath) {
  console.error('Set DEPLOY_SSH_PASSWORD or DEPLOY_SSH_KEY');
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

const connectConfig = { host, port: 22, username };
if (privateKeyPath) {
  connectConfig.privateKey = fs.readFileSync(privateKeyPath);
} else {
  connectConfig.password = password;
}

const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log('=== SMS env (masked) ===');
    console.log(
      await run(
        conn,
        "grep -E '^(SMS_AERO|NODE_ENV)' /opt/pvz/.env | sed 's/\\(SECRET\\|KEY\\|PASSWORD\\)=.*/\\1=***/'"
      )
    );

    console.log('\n=== PM2 env NODE_ENV ===');
    console.log(await run(conn, 'pm2 env 0 2>/dev/null | grep NODE_ENV || pm2 describe pvz-api | grep -i env'));

    console.log('\n=== Recent logs ===');
    console.log(await run(conn, 'pm2 logs pvz-api --lines 30 --nostream 2>&1 | tail -30'));

    console.log('\n=== Test send-sms-otp ===');
    const test = await run(
      conn,
      "curl -s -w '\\nHTTP:%{http_code}\\n' -X POST http://localhost:3000/api/auth/send-sms-otp -H 'Content-Type: application/json' -d '{\"phone\":\"79143288207\",\"role\":\"employee\"}'"
    );
    console.log(test);

    console.log('\n=== Logs after test ===');
    console.log(await run(conn, 'pm2 logs pvz-api --lines 15 --nostream 2>&1 | tail -15'));

    conn.end();
  } catch (e) {
    console.error(e.message);
    conn.end();
    process.exit(1);
  }
});
conn.on('error', (e) => {
  console.error('SSH error:', e.message);
  process.exit(1);
});
conn.connect(connectConfig);
