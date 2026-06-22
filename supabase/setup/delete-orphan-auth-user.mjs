/**
 * Удаление «осиротевшего» auth.users без профиля/ПВЗ (после незавершённой регистрации).
 * Run: node supabase/setup/delete-orphan-auth-user.mjs <email>
 */
import fs from 'fs';
import pg from 'pg';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: node supabase/setup/delete-orphan-auth-user.mjs <email>');
  process.exit(1);
}

const pass = fs.readFileSync('.env', 'utf8').match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
if (!pass) throw new Error('SUPABASE_DB_PASSWORD missing');

const client = new pg.Client({
  connectionString: `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pass)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`,
});
await client.connect();

const users = await client.query(
  `select id, email, created_at from auth.users where lower(email) = lower($1)`,
  [email]
);
if (users.rows.length === 0) {
  console.log('No auth.users row for', email);
  await client.end();
  process.exit(0);
}

for (const u of users.rows) {
  const prof = await client.query('select id, role from profiles where id = $1', [u.id]);
  const pvz = await client.query('select id from pvz where owner_id = $1 limit 1', [u.id]);
  console.log('user', u.id, 'profile:', prof.rows[0] ?? null, 'pvz:', pvz.rows.length > 0);

  if (prof.rows.length > 0 || pvz.rows.length > 0) {
    console.error('Refusing delete: profile or PVZ exists');
    await client.end();
    process.exit(1);
  }

  await client.query('delete from auth.users where id = $1', [u.id]);
  console.log('Deleted auth.users', u.id);
}

await client.end();
