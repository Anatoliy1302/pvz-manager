/**
 * SSH: тест send-sms с VPS и прямой SMS Aero auth.
 * Usage: DEPLOY_SSH_PASSWORD=... node scripts/diag-vps-sms.mjs [phone]
 */
import fs from 'fs';
import { Client } from 'ssh2';

const phone = process.argv[2] || '79143288207';
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
    console.log('=== curl send-sms FROM VPS ===');
    const supa = await run(
      conn,
      `curl -s -w '\\nHTTP:%{http_code} TIME:%{time_total}s\\n' -X POST 'https://wygpcndnlxfzbbuogqrt.supabase.co/functions/v1/send-sms' -H 'Content-Type: application/json' -d '{\"phone\":\"${phone}\",\"code\":\"123456\"}' --max-time 20`
    );
    console.log(supa);

    console.log('\n=== curl send-sms-otp localhost ===');
    const local = await run(
      conn,
      `curl -s -w '\\nHTTP:%{http_code} TIME:%{time_total}s\\n' -X POST 'http://localhost:3000/api/auth/send-sms-otp' -H 'Content-Type: application/json' -d '{\"phone\":\"${phone}\",\"role\":\"employee\"}' --max-time 25`
    );
    console.log(local);

    console.log('\n=== pm2 logs (last 8) ===');
    console.log(await run(conn, 'pm2 logs pvz-api --lines 8 --nostream 2>&1 | tail -8'));

    conn.end();
  } catch (e) {
    console.error(e.message);
    conn.end();
    process.exit(1);
  }
});
conn.connect(connectConfig);
