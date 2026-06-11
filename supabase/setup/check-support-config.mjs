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

const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(loadPassword())}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;
const client = new Client({ connectionString: url, connectionTimeoutMillis: 60000 });
await client.connect();

const { rows } = await client.query(
  `select function_url, webhook_secret is not null as has_secret
   from private.support_notify_config where singleton = true`
);
console.log('support_notify_config:', rows[0] ?? 'NOT CONFIGURED');
await client.end();
