import path from 'path';
import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const MIGRATIONS = [
  '20250615000000_add_subscription_fields.sql',
  '20250615120000_multiaccount_protection.sql',
];

function loadPassword() {
  const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  const match = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m);
  if (!match) throw new Error('SUPABASE_DB_PASSWORD missing');
  return match[1].trim();
}

const password = loadPassword();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

async function applyMigration(fileName) {
  const version = fileName.replace(/_.*$/, '');
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations', fileName),
    'utf8',
  );

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 90000 });
  await client.connect();
  try {
    await client.query(sql);
    await client.query(
      'insert into supabase_migrations.schema_migrations (version) values ($1) on conflict do nothing',
      [version],
    );
    console.log(`Migration ${version} applied`);
  } finally {
    await client.end();
  }
}

for (const fileName of MIGRATIONS) {
  await applyMigration(fileName);
}

const verify = new Client({ connectionString: url, connectionTimeoutMillis: 60000 });
await verify.connect();
const { rows } = await verify.query(
  "select version from supabase_migrations.schema_migrations where version in ('20250615000000', '20250615120000') order by version",
);
console.log('Recorded:', rows.map((r) => r.version).join(', '));
await verify.end();
