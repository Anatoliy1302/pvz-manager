/**
 * Добавляет SMS_AERO_* в /opt/pvz/.env и перезапускает API.
 * Usage:
 *   SMS_AERO_LOGIN=... SMS_AERO_SECRET=... DEPLOY_SSH_PASSWORD=... node scripts/sync-sms-env-to-vps.mjs
 */
import fs from 'fs';
import { Client } from 'ssh2';

const login = process.env.SMS_AERO_LOGIN ?? process.env.SMS_AERO_EMAIL;
const secret = process.env.SMS_AERO_SECRET ?? process.env.SMS_AERO_API_KEY;
const sign = process.env.SMS_AERO_SIGN ?? 'SMS Aero';
const template =
  process.env.SMS_AERO_MESSAGE_TEMPLATE ?? '{code}';

const host = process.env.DEPLOY_SSH_HOST || '79.137.192.194';
const username = process.env.DEPLOY_SSH_USER || 'root';
const password = process.env.DEPLOY_SSH_PASSWORD;
const privateKeyPath = process.env.DEPLOY_SSH_KEY;
const remotePath = process.env.DEPLOY_PATH || '/opt/pvz';

if (!login || !secret) {
  console.error('Set SMS_AERO_LOGIN and SMS_AERO_SECRET');
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
  `SMS_AERO_LOGIN=${login}`,
  `SMS_AERO_SECRET=${secret}`,
  `SMS_AERO_SIGN=${sign}`,
  `SMS_AERO_MESSAGE_TEMPLATE=${template}`,
  'SUPABASE_SEND_SMS_URL=0',
  'NODE_ENV=production',
];

const remoteScript = `
set -e
ENV_FILE=${shellQuote(`${remotePath}/.env`)}
touch "$ENV_FILE"
for key in SMS_AERO_LOGIN SMS_AERO_SECRET SMS_AERO_SIGN SMS_AERO_MESSAGE_TEMPLATE SUPABASE_SEND_SMS_URL NODE_ENV; do
  sed -i "/^$key=/d" "$ENV_FILE"
done
cat >> "$ENV_FILE" <<'EOF'
${lines.join('\n')}
EOF
cd ${shellQuote(remotePath)}
pm2 restart pvz-api --update-env
sleep 2
curl -sf http://localhost:3000/ >/dev/null
echo "SMS env synced, pm2 restarted"
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
