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
const sql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20250608180000_advance_requests.sql'),
  'utf8'
);

const statements = sql
  .split(';')
  .map((s) => s.replace(/--[^\n]*/g, '').trim())
  .filter((s) => s.length > 0);

for (let i = 0; i < statements.length; i++) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 90000 });
  await client.connect();
  console.log(`[${i + 1}/${statements.length}]`);
  await client.query(statements[i]);
  await client.end();
}

const mark = new Client({ connectionString: url, connectionTimeoutMillis: 60000 });
await mark.connect();
await mark.query(
  "insert into supabase_migrations.schema_migrations (version) values ('20250608180000') on conflict do nothing"
);
await mark.end();
console.log('Migration 20250608180000 applied');
