const fs = require('fs');

function loadEnv(name) {
  const raw = fs.readFileSync('/opt/pvz/.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const login = loadEnv('SMS_AERO_LOGIN');
const secret = loadEnv('SMS_AERO_SECRET');
const auth = Buffer.from(`${login}:${secret}`).toString('base64');
const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };

async function main() {
  const bal = await fetch('https://gate.smsaero.ru/v2/balance', { headers });
  console.log('BALANCE', bal.status, await bal.text());

  const attempts = [
    ['AUTH', { number: '79143288207', text: 'Код PVZ Personal: 112233', sign: 'SMS Aero', channel: 'AUTH' }],
    ['SERVICE', { number: '79143288207', text: 'Код PVZ Personal: 112233', sign: 'SMS Aero', channel: 'SERVICE' }],
    ['FREE', { number: '79143288207', text: '112233', sign: 'SMS Aero' }],
  ];

  for (const [label, body] of attempts) {
    const res = await fetch('https://gate.smsaero.ru/v2/sms/send', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(`SEND_${label}`, res.status, (await res.text()).slice(0, 500));
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
