import fs from 'fs';
import path from 'path';
import pg from 'pg';

const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const pw = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pw)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const uid = 'd67491dc-e7dc-4ef9-bbb1-4ad360491195';
const client = new pg.Client({ connectionString: url });
await client.connect();

const fn = await client.query(
  `select proname, pg_get_function_result(oid) as result_type
   from pg_proc where proname = 'ensure_owner_profile_for_login'`
);
console.log('RPC:', fn.rows);

const prof = await client.query('select id, role, email, pvz_id from profiles where id = $1', [uid]);
console.log('profile:', prof.rows[0] ?? null);

const pvzAll = await client.query(
  `select p.id, p.name, p.owner_id, u.email
   from pvz p left join auth.users u on u.id = p.owner_id limit 10`
);
console.log('pvz sample:', pvzAll.rows);

// One-time fix for accounts stuck as employee after owner email login (dev/support).
if (process.argv.includes('--fix-owner-role')) {
  await client.query(`select set_config('pvz.owner_login_profile_sync', '1', true)`);
  const upd = await client.query(
    `update public.profiles set role = 'owner', status = 'active', updated_at = now()
     where id = $1 and role::text in ('employee', 'pending')
     returning id, role, email`,
    [uid]
  );
  console.log('fixed:', upd.rows);
  await client.end();
  process.exit(0);
}

await client.end();
