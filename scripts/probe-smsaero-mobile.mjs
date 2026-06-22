import crypto from 'crypto';

const clientId = process.env.SMSAERO_CLIENT_ID || '7c1635bd-c077-4bb7-9261-be99df40e5f9';
const apiSecret = process.env.SMSAERO_SECRET || 'b374e797568a50de4fbe9861c04a6be284eaf2105f8871482595b886a2b030bf';
const fp = 'a3f9c0123456789abcdef0123456789ab';
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = crypto.createHmac('sha256', apiSecret).update(clientId + fp + timestamp).digest('hex');

async function main() {
  const tokRes = await fetch('https://midsdk.smsaero.ru/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, fingerprint_hash: fp, timestamp, signature }),
  });
  const tokBody = await tokRes.json();
  const token = tokBody.token;
  console.log('token', tokRes.status, token ? 'ok' : tokBody);

  const auth = 'Basic ' + Buffer.from(`${clientId}:${apiSecret}`).toString('base64');
  const probes = [
    ['midsdk create-session', 'https://midsdk.smsaero.ru/api/create-session', { phone: '79143288207', sign: 'PVZ' }, { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }],
    ['gate create-session', 'https://gate.smsaero.ru/v2/auth/create-session', { phone: '79143288207', sign: 'PVZ' }, { 'Content-Type': 'application/json', Authorization: auth }],
    ['midsdk session', 'https://midsdk.smsaero.ru/api/session', { phone: '79143288207', sign: 'PVZ', token }, { 'Content-Type': 'application/json' }],
    ['midsdk send', 'https://midsdk.smsaero.ru/api/send', { phone: '79143288207', sign: 'PVZ' }, { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }],
    ['mobile-id send old creds', 'https://gate.smsaero.ru/v2/mobile-id/send', { number: '79143288207', sign: 'PVZ', callbackUrl: 'http://79.137.192.194:3000/api/webhooks/smsaero-mobile-id' }, { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from('krv_kravec@mail.ru:dbWQQ24P6QLENNkyB4epWMiuykfv').toString('base64') }],
  ];

  for (const [name, url, body, headers] of probes) {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    console.log(name, r.status, (await r.text()).slice(0, 250));
  }
}

main().catch(console.error);
