/**
 * Публичная проверка DNS pvzpersonal.ru для NotiSend / mail.ru (VPS API, без Supabase).
 *
 *   node scripts/check-pvzpersonal-dns.mjs
 */
import dns from 'dns/promises';

const DOMAIN = 'pvzpersonal.ru';

async function safe(fn, label) {
  try {
    const value = await fn();
    return { ok: true, label, value };
  } catch (error) {
    return { ok: false, label, error: error.code ?? String(error) };
  }
}

function printTxt(name, records) {
  const flat = records?.flat?.() ?? [];
  console.log(`  ${name}: ${flat.join(' | ') || '(пусто)'}`);
}

const results = [];

results.push(await safe(() => dns.resolve4(DOMAIN), 'A @'));
results.push(await safe(() => dns.resolveMx(DOMAIN), 'MX @'));
results.push(await safe(() => dns.resolveTxt(DOMAIN), 'TXT @ (SPF)'));
results.push(await safe(() => dns.resolveTxt(`_dmarc.${DOMAIN}`), 'TXT _dmarc'));
results.push(await safe(() => dns.resolveTxt(`service.${DOMAIN}`), 'TXT service'));
results.push(await safe(() => dns.resolve4(`service.${DOMAIN}`), 'A service'));

const dkimSelectors = [
  'mdmdmail._domainkey',
  'msndr._domainkey',
  'notisend._domainkey',
  'dkim._domainkey',
  'default._domainkey',
  'mail._domainkey',
];

let dkimFound = false;
for (const sel of dkimSelectors) {
  const r = await safe(() => dns.resolveTxt(`${sel}.${DOMAIN}`), `TXT ${sel}`);
  if (r.ok && r.value?.length) {
    dkimFound = true;
    results.push(r);
  }
}

console.log(`=== Публичный DNS: ${DOMAIN} ===\n`);
console.log('(mail.ru смотрит эти записи у регистратора домена, не галочки в NotiSend)\n');

for (const r of results) {
  if (!r.ok) {
    console.log(`✗ ${r.label}: НЕТ (${r.error})`);
    continue;
  }
  console.log(`✓ ${r.label}`);
  if (r.label.startsWith('TXT')) {
    printTxt(r.label, r.value);
  } else if (r.label.startsWith('MX')) {
    for (const mx of r.value) {
      console.log(`  priority ${mx.priority} → ${mx.exchange}`);
    }
  } else {
    console.log(`  ${JSON.stringify(r.value)}`);
  }
}

console.log('\n--- Диагноз для mail.ru ---\n');

const mx = results.find((r) => r.label === 'MX @');
const spf = results.find((r) => r.label === 'TXT @ (SPF)');
const serviceSpf = results.find((r) => r.label === 'TXT service');
const dmarc = results.find((r) => r.label === 'TXT _dmarc');

const rootSpfText = spf?.ok ? spf.value?.flat?.().join(' ') ?? '' : '';
const serviceSpfText = serviceSpf?.ok ? serviceSpf.value?.flat?.().join(' ') ?? '' : '';
const hasRootMsndr = rootSpfText.includes('msndr.net');
const hasServiceMsndr = serviceSpfText.includes('msndr.net');

if (!mx?.ok) {
  console.log('✗ Нет MX-записи на @ — mail.ru часто отвечает «550 non-local sender verification failed».');
  console.log('  Добавьте MX @ → pvzpersonal.ru. (приоритет 10, точка в конце если требует регистратор).');
  console.log('  Или скопируйте MX из NotiSend → Домены → pvzpersonal.ru.');
}

if (!dkimFound) {
  console.log('✗ DKIM не найден в публичном DNS @.');
  console.log('  NotiSend → Домены → pvzpersonal.ru → скопируйте TXT DKIM (хост вида mdmdmail._domainkey).');
}

if (!hasRootMsndr) {
  console.log('✗ SPF на @ не содержит include:msndr.net — mail.ru отклоняет noreply@pvzpersonal.ru.');
  if (hasServiceMsndr) {
    console.log('  ⚠ SPF с msndr.net есть только на поддомене service — для OTP это не помогает.');
  }
  console.log('  Добавьте TXT @ со значением: v=spf1 include:msndr.net ~all');
  console.log('  (mailru-verification и google-site-verification оставьте отдельными TXT-записями).');
} else {
  console.log('✓ SPF @ с msndr.net на месте');
}

if (dmarc?.ok) {
  console.log('✓ DMARC на месте');
} else {
  console.log('⚠ DMARC не найден (желательно для mail.ru)');
}

console.log('\nОшибка «550 non-local sender verification failed» = домен отправителя не подтверждён.');
console.log('Правьте DNS у регистратора (Reg.ru), затем «Проверить» в NotiSend.');
console.log('\nПосле правок DNS: подождите 15–60 мин, затем:');
console.log('  node scripts/check-notisend-delivery.mjs --send ваш@mail.ru');

const mailRuReady = hasRootMsndr && dkimFound;
if (!mailRuReady) {
  process.exit(1);
}
