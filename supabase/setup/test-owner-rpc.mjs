import fs from 'fs';
import path from 'path';
import pg from 'pg';

const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const pw = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)[1].trim();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pw)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const uid = 'd67491dc-e7dc-4ef9-bbb1-4ad360491195';
const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const uidCheck = await client.query('select auth.uid() as uid');
console.log('auth.uid():', uidCheck.rows[0]?.uid);
await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);

const before = await client.query('select role from profiles where id = $1', [uid]);
console.log('role before:', before.rows[0]?.role);

try {
  await client.query(`select public.ensure_owner_profile_for_login($1)`, ['krv_kravec@mail.ru']);
  console.log('RPC ok');
} catch (e) {
  console.error('RPC error:', e.message);
}

const prof = await client.query('select id, role, email from profiles where id = $1', [uid]);
console.log('profile after:', prof.rows[0]);

await client.end();
