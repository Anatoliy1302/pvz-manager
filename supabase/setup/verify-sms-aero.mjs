/**
 * Проверка логина и API-ключа SMS Aero (без отправки SMS).
 *
 * Usage:
 *   node supabase/setup/verify-sms-aero.mjs kr_kravec@mail.ru YOUR_API_KEY
 */
const login = process.argv[2];
const apiKey = process.argv[3];

if (!login || !apiKey) {
  console.error('Usage: node supabase/setup/verify-sms-aero.mjs <login> <api_key>');
  process.exit(1);
}

const auth = Buffer.from(`${login}:${apiKey}`).toString('base64');

const response = await fetch('https://gate.smsaero.ru/v2/auth', {
  headers: { Authorization: `Basic ${auth}` },
});

const body = await response.json();
console.log('HTTP', response.status);
console.log(JSON.stringify(body, null, 2));

if (response.ok && body.success) {
  console.log('\nOK: credentials valid. Update Supabase secret:');
  console.log(`npx supabase secrets set SMS_AERO_LOGIN=${login} SMS_AERO_SECRET=${apiKey} --project-ref wygpcndnlxfzbbuogqrt`);
  process.exit(0);
}

console.error('\nFAIL: check login (email or username from cabinet) and API key at https://smsaero.ru/cabinet/settings/apikey/');
process.exit(1);
