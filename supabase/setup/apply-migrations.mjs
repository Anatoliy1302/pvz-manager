import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

function loadPassword() {
  const envPath = path.resolve(process.cwd(), '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const match = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m);
  if (!match) throw new Error('SUPABASE_DB_PASSWORD not found in .env');
  return match[1].trim();
}

const password = loadPassword();
const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;

const sqlFile = path.resolve(process.cwd(), 'supabase/setup/repair-and-apply-migrations.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

const statements = sql
  .split(';')
  .map((s) => s.replace(/--[^\n]*/g, '').trim())
  .filter((s) => s.length > 0);

async function runStatement(statement, index, total) {
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 90000,
  });

  try {
    await client.connect();
    console.log(`[${index + 1}/${total}] OK start`);
    await client.query(statement);
    console.log(`[${index + 1}/${total}] OK done`);
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

for (let i = 0; i < statements.length; i++) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      await runStatement(statements[i], i, statements.length);
      break;
    } catch (error) {
      attempts++;
      console.error(`[${i + 1}] attempt ${attempts} failed:`, error.message);
      if (attempts >= 3) process.exit(1);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const verify = new Client({ connectionString: url, connectionTimeoutMillis: 60000 });
await verify.connect();
const { rows } = await verify.query(
  'select version from supabase_migrations.schema_migrations order by version'
);
console.log('Applied migrations:', rows.map((r) => r.version).join(', '));
await verify.end();
