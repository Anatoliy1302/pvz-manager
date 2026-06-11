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
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:6543/postgres`;

const client = new Client({ connectionString: url, connectionTimeoutMillis: 60000 });
await client.connect();

const migrations = await client.query(
  'select version from supabase_migrations.schema_migrations order by version'
);
console.log('Migrations:', migrations.rows.map((r) => r.version));

const tables = await client.query(
  "select tablename from pg_tables where schemaname='public' and tablename='user_push_tokens'"
);
console.log('user_push_tokens:', tables.rows.length > 0 ? 'exists' : 'missing');

await client.end();
