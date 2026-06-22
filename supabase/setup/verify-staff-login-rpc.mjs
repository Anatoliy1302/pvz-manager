#!/usr/bin/env node
import fs from 'node:fs';
import pg from 'pg';

const password = fs
  .readFileSync('.env', 'utf8')
  .match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]
  ?.trim();
if (!password) throw new Error('SUPABASE_DB_PASSWORD missing in .env');

const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const fns = await client.query(`
    select proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and proname in (
        'ensure_phone_profile_for_login',
        'ensure_staff_profile_for_login',
        'check_pending_invitation_for_phone',
        'get_pending_invitation_for_login',
        'normalize_phone'
      )
    order by proname
  `);
  console.log('Functions:', fns.rows.map((r) => r.proname).join(', '));

  const test = await client.query(`select public.normalize_phone('8 (900) 123-45-67') as phone`);
  console.log('normalize_phone test:', test.rows[0].phone);
} finally {
  await client.end();
}
