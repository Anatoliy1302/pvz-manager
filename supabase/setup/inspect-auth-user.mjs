import fs from 'fs';
import pg from 'pg';

const email = (process.argv[2] || 'moda_gorod_vl@mail.ru').trim().toLowerCase();
const pass = fs.readFileSync('.env', 'utf8').match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
const client = new pg.Client({
  connectionString: `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pass)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`,
});
await client.connect();

const users = await client.query(
  'select id, email, email_confirmed_at, created_at from auth.users where lower(email)=lower($1)',
  [email]
);
console.log('auth.users:', users.rows);
for (const u of users.rows) {
  const tables = [
    ['profiles', 'select id, role, email, pvz_id, phone from profiles where id=$1', [u.id]],
    ['pvz', 'select id, name from pvz where owner_id=$1', [u.id]],
    ['user_push_tokens', 'select count(*)::int as n from user_push_tokens where user_id=$1', [u.id]],
  ];
  for (const [name, sql, params] of tables) {
    const r = await client.query(sql, params);
    console.log(name + ':', r.rows);
  }
}
await client.end();
