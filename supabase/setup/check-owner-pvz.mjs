import fs from 'fs';
import path from 'path';
import pg from 'pg';

const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const pw = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pw)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const uid = process.argv[2] || 'd67491dc-e7dc-4ef9-bbb1-4ad360491195';
const client = new pg.Client({ connectionString: url });
await client.connect();

const user = await client.query('select id, email from auth.users where id = $1', [uid]);
console.log('user:', user.rows[0] ?? null);

const pvz = await client.query(
  `select id, name, owner_id from public.pvz where owner_id = $1`,
  [uid]
);
console.log('pvz by owner_id:', pvz.rows);

const profile = await client.query(
  `select id, role, pvz_id, pvz_ids from public.profiles where id = $1`,
  [uid]
);
console.log('profile:', profile.rows[0] ?? null);

if (user.rows[0]?.email) {
  const email = user.rows[0].email;
  const byEmail = await client.query(
    `select p.id, p.name, p.owner_id, u.email as owner_email
     from public.pvz p
     join auth.users u on u.id = p.owner_id
     where lower(u.email) = lower($1)`,
    [email]
  );
  console.log('pvz by owner email:', byEmail.rows);
}

await client.end();
