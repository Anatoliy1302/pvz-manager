import fs from 'fs';
import pg from 'pg';

const { Client } = pg;

function loadPassword() {
  const raw = fs.readFileSync('.env', 'utf8');
  const match = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m);
  if (!match) throw new Error('SUPABASE_DB_PASSWORD missing');
  return match[1].trim();
}

const client = new Client({
  connectionString: `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(loadPassword())}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`,
});
await client.connect();

const { rows } = await client.query(`
  select email,
         email_confirmed_at is not null as confirmed,
         confirmation_sent_at,
         recovery_sent_at,
         created_at
  from auth.users
  where email is not null
  order by created_at desc
  limit 10
`);

console.log(JSON.stringify(rows, null, 2));
await client.end();
