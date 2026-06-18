import fs from 'fs';
import pg from 'pg';

const { Client } = pg;
const email = process.argv[2];
if (!email) {
  console.error('Usage: node supabase/setup/check-user-email.mjs <email>');
  process.exit(1);
}

const pass = fs.readFileSync('.env', 'utf8').match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
if (!pass) throw new Error('SUPABASE_DB_PASSWORD missing');

const client = new Client({
  connectionString: `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pass)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`,
});
await client.connect();
const { rows } = await client.query(
  `select email, email_confirmed_at, confirmation_sent_at, recovery_sent_at, last_sign_in_at, created_at
   from auth.users where lower(email) = lower($1) order by created_at desc limit 5`,
  [email],
);
console.log(JSON.stringify(rows, null, 2));
await client.end();
