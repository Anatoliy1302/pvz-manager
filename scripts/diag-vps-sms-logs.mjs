/**
 * Подробные логи SMS на VPS.
 * Usage: DEPLOY_SSH_PASSWORD=... node scripts/diag-vps-sms-logs.mjs
 */
import { Client } from 'ssh2';

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

const conn = new Client();
conn.on('ready', async () => {
  try {
    console.log(await run(conn, 'grep SMS_AERO /opt/pvz/.env | sed "s/SECRET=.*/SECRET=***/"'));
    console.log('\n--- send test ---');
    console.log(
      await run(
        conn,
        "curl -s -X POST http://localhost:3000/api/auth/send-sms-otp -H 'Content-Type: application/json' -d '{\"phone\":\"79143288207\",\"role\":\"employee\"}'"
      )
    );
    await new Promise((r) => setTimeout(r, 2000));
    console.log('\n--- logs ---');
    console.log(await run(conn, 'pm2 logs pvz-api --lines 20 --nostream 2>&1 | tail -20'));
    conn.end();
  } catch (e) {
    console.error(e.message);
    conn.end();
    process.exit(1);
  }
});
conn.connect({ host: '79.137.192.194', username: 'root', password });
