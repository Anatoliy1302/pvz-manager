/**
 * Проверка приглашения сотрудника в облаке (anon RPC).
 * Usage: node supabase/setup/check-employee-invite.mjs 79991234567 employee
 */
import fs from 'fs';

function loadEnv(name) {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(new RegExp(`^${name}=(.+)$`, 'm'));
  return match?.[1]?.trim();
}

const base = (loadEnv('EXPO_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const key = loadEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const phone = process.argv[2] || '79991234567';
const role = process.argv[3] || 'employee';

if (!base || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or key');
  process.exit(1);
}

async function rpc(fn, params) {
  const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log('=== Employee invite check ===\n');
console.log('Phone:', phone, 'Role:', role);

const check = await rpc('check_pending_invitation_for_phone', {
  p_phone: phone,
  p_role: role,
});
console.log('\ncheck_pending_invitation_for_phone:', check.status, check.body);

if (check.status === 404) {
  console.log('\n❌ RPC не найден — примените миграцию 20250620140000_employee_invitation_login.sql');
  process.exit(1);
}

if (check.body === true) {
  console.log('\n✅ Приглашение в облаке — сотрудник может запросить SMS');
} else {
  console.log('\n❌ Pending-приглашения нет в таблице invitations для этого номера');
  console.log('   Владелец: добавьте сотрудника заново (нужна синхронизация с интернетом)');
}
