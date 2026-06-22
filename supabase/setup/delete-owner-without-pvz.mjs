/**
 * Полное удаление владельца без ПВЗ (незавершённая регистрация / тест).
 * Run: node supabase/setup/delete-owner-without-pvz.mjs <email>
 */
import fs from 'fs';
import pg from 'pg';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node supabase/setup/delete-owner-without-pvz.mjs <email>');
  process.exit(1);
}

const pass = fs.readFileSync('.env', 'utf8').match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
if (!pass) throw new Error('SUPABASE_DB_PASSWORD missing');

const client = new pg.Client({
  connectionString: `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pass)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`,
});
await client.connect();

const users = await client.query(
  'select id from auth.users where lower(email) = lower($1)',
  [email]
);
if (users.rows.length === 0) {
  console.log('No user for', email);
  await client.end();
  process.exit(0);
}

for (const { id } of users.rows) {
  const pvz = await client.query('select id from pvz where owner_id = $1 limit 1', [id]);
  if (pvz.rows.length > 0) {
    console.error('Refusing: owner has PVZ', pvz.rows[0].id);
    await client.end();
    process.exit(1);
  }

  await client.query('delete from user_push_tokens where user_id = $1', [id]);
  await client.query('delete from profiles where id = $1', [id]);
  await client.query('delete from auth.users where id = $1', [id]);
  console.log('Deleted owner without PVZ:', id, email);
}

await client.end();
