/**
 * Синхронизация SMS Aero Mobile Auth env на VPS.
 * Usage: DEPLOY_SSH_PASSWORD=... node scripts/sync-smsaero-env-to-vps.mjs
 */
import fs from 'fs';
import { Client } from 'ssh2';

const clientId = process.env.SMSAERO_CLIENT_ID;
const secret = process.env.SMSAERO_SECRET;
const sign = process.env.SMSAERO_SIGN ?? 'PVZ';
const testMode = process.env.SMSAERO_TEST_MODE ?? '1';
const gateLogin = process.env.SMSAERO_GATE_LOGIN ?? process.env.SMSAERO_LOGIN;
const gateKey = process.env.SMSAERO_GATE_API_KEY ?? process.env.SMSAERO_API_KEY;
const publicUrl = process.env.PUBLIC_API_URL ?? 'http://79.137.192.194:3000';

const host = process.env.DEPLOY_SSH_HOST || '79.137.192.194';
const username = process.env.DEPLOY_SSH_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const privateKeyPath = process.env.DEPLOY_SSH_KEY;
const remotePath = process.env.DEPLOY_PATH || '/opt/pvz';

if (!clientId || !secret) {
  console.error('Set SMSAERO_CLIENT_ID and SMSAERO_SECRET');
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

const connectConfig = { host, port: 22, username };
if (privateKeyPath) {
  connectConfig.privateKey = fs.readFileSync(privateKeyPath);
} else {
  connectConfig.password = password;
}

const lines = [
  `SMSAERO_CLIENT_ID=${clientId}`,
  `SMSAERO_SECRET=${secret}`,
  `SMSAERO_SIGN=${sign}`,
  `SMSAERO_TEST_MODE=${testMode}`,
  `PUBLIC_API_URL=${publicUrl}`,
  'SUPABASE_SEND_SMS_URL=0',
  'NODE_ENV=production',
];
if (gateLogin && gateKey) {
  lines.push(`SMSAERO_GATE_LOGIN=${gateLogin}`, `SMSAERO_GATE_API_KEY=${gateKey}`);
}

const remoteScript = `
set -e
ENV_FILE=${shellQuote(`${remotePath}/.env`)}
touch "$ENV_FILE"
for key in SMSAERO_CLIENT_ID SMSAERO_SECRET SMSAERO_SIGN SMSAERO_TEST_MODE SMSAERO_GATE_LOGIN SMSAERO_GATE_API_KEY PUBLIC_API_URL SUPABASE_SEND_SMS_URL NODE_ENV; do
  sed -i "/^$key=/d" "$ENV_FILE"
done
cat >> "$ENV_FILE" <<'EOF'
${lines.join('\n')}
EOF
cd ${shellQuote(remotePath)}
pm2 restart pvz-api --update-env
sleep 2
curl -sf http://localhost:3000/ >/dev/null
echo "SMS Aero env synced"
`;

const conn = new Client();
conn.on('ready', async () => {
  try {
    await run(conn, remoteScript);
    conn.end();
  } catch (e) {
    console.error(e.message);
    conn.end();
    process.exit(1);
  }
});
conn.connect(connectConfig);
