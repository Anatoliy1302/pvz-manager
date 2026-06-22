import fs from 'fs';
import path from 'path';
import pg from 'pg';

const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const pw = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pw)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const uid = process.argv[2] || 'd67491dc-e7dc-4ef9-bbb1-4ad360491195';
const client = new pg.Client({ connectionString: url });
await client.connect();

const def = await client.query(
  `select prosrc from pg_proc where proname = 'enforce_profile_sensitive_fields'`
);
console.log('trigger has bypass:', def.rows[0]?.prosrc?.includes('owner_login_profile_sync'));

await client.query('BEGIN');
await client.query(`select set_config('pvz.owner_login_profile_sync', '1', true)`);
const upd = await client.query(
  `update public.profiles set role = 'owner', status = 'active', updated_at = now()
   where id = $1 returning id, role, email`,
  [uid]
);
await client.query('COMMIT');
console.log('fixed:', upd.rows);

await client.end();
