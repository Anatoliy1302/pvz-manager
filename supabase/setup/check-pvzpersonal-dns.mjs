/**
 * Публичная проверка DNS pvzpersonal.ru (то, что видит mail.ru).
 *
 *   node supabase/setup/check-pvzpersonal-dns.mjs
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
console.log('(mail.ru смотрит именно эти записи, не галочки в NotiSend)\n');

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
const dmarc = results.find((r) => r.label === 'TXT _dmarc');

if (!mx?.ok) {
  console.log('✗ Нет MX-записи на домене — mail.ru часто отвечает «550 non-local sender verification failed».');
  console.log('  Добавьте MX из панели NotiSend (Домены → pvzpersonal.ru → шаг 1 или 2).');
}

if (!dkimFound) {
  console.log('✗ DKIM не найден в публичном DNS (ни один из типовых селекторов).');
  console.log('  Скопируйте TXT DKIM из NotiSend в DNS регистратора (точное имя хоста из таблицы).');
}

if (spf?.ok) {
  const text = spf.value?.flat?.().join('') ?? '';
  if (!text.includes('msndr.net')) {
    console.log('⚠ SPF есть, но не include:msndr.net');
  } else {
    console.log('✓ SPF с msndr.net на месте');
  }
}

if (dmarc?.ok) {
  console.log('✓ DMARC на месте');
} else {
  console.log('⚠ DMARC не найден (желательно для mail.ru)');
}

console.log('\nПосле правок DNS: подождите 15–60 мин, нажмите «Проверить» в NotiSend, затем:');
console.log('  node supabase/setup/check-notisend-delivery.mjs --send krv_kravec@mail.ru');
