import fs from 'fs';
import path from 'path';
import pg from 'pg';

const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const pw = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pw)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const email = 'krv_kravec@mail.ru';
const client = new pg.Client({ connectionString: url });
await client.connect();

const users = await client.query(
  `select id, email, created_at from auth.users where lower(email) = lower($1)`,
  [email]
);
console.log('auth.users:', users.rows);

for (const u of users.rows) {
  const prof = await client.query('select id, role, pvz_id from profiles where id = $1', [u.id]);
  const pvz = await client.query('select id, name, owner_id from pvz where owner_id = $1', [u.id]);
  console.log('user', u.id.slice(0, 8), 'profile:', prof.rows[0], 'pvz:', pvz.rows);
}

const allPvz = await client.query(
  `select p.id, p.name, p.owner_id, u.email
   from pvz p left join auth.users u on u.id = p.owner_id
   where lower(coalesce(u.email, '')) = lower($1)`,
  [email]
);
console.log('pvz by email join:', allPvz.rows);

await client.end();
