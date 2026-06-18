/**
 * Список RLS-политик и таблиц без RLS в public.
 * Запуск: node supabase/setup/audit-rls-policies.mjs
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

function loadPassword() {
  const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  const match = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m);
  if (!match) throw new Error('SUPABASE_DB_PASSWORD missing');
  return match[1].trim();
}

const password = loadPassword();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const client = new Client({ connectionString: url, connectionTimeoutMillis: 90000 });
await client.connect();

const tablesWithoutRls = await client.query(`
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity = false
    and c.relname not like 'pg_%'
  order by c.relname
`);

const policies = await client.query(`
  select schemaname, tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'public'
  order by tablename, policyname
`);

console.log('\n=== Tables WITHOUT RLS ===\n');
if (tablesWithoutRls.rows.length === 0) {
  console.log('(none — all public tables have RLS enabled)');
} else {
  for (const row of tablesWithoutRls.rows) {
    console.log(`- ${row.table_name}`);
  }
}

console.log('\n=== RLS policies by table ===\n');
let current = '';
for (const row of policies.rows) {
  if (row.tablename !== current) {
    current = row.tablename;
    console.log(`\n[${current}]`);
  }
  console.log(`  ${row.policyname} (${row.cmd})`);
}

await client.end();
