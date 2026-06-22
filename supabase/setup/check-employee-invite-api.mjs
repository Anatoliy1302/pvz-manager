/**
 * Проверка приглашения сотрудника на VPS API.
 * Usage: node supabase/setup/check-employee-invite-api.mjs 79143288207 employee
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://79.137.192.194:3000';
const phone = process.argv[2] || '79143288207';
const role = process.argv[3] || 'employee';

const digits = String(phone).replace(/\D/g, '');
const normalized =
  digits.length === 10
    ? `7${digits}`
    : digits.length === 11 && digits.startsWith('8')
      ? `7${digits.slice(1)}`
      : digits;

const url = `${API_URL.replace(/\/+$/, '')}/api/invitations/check?phone=${encodeURIComponent(normalized)}&role=${encodeURIComponent(role)}`;

console.log('=== Employee invite check (VPS API) ===\n');
console.log('URL:', url);

const res = await fetch(url);
const body = await res.json().catch(() => ({}));

console.log('Status:', res.status);
console.log('Body:', JSON.stringify(body, null, 2));

if (body.pending === true) {
  console.log('\n✅ Приглашение на сервере — сотрудник может запросить SMS');
} else {
  console.log('\n❌ Pending-приглашения нет на VPS');
  console.log('   Владелец: войдите в приложение (email + PIN) и добавьте сотрудника заново');
  console.log('   или откройте список сотрудников → «Обновить приглашение»');
}
