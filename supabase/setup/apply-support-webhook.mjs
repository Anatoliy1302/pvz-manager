import path from 'path';
import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';

function loadEnv() {
  const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  const password = raw.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]?.trim();
  const webhookSecret = raw.match(/^SUPPORT_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim();

  if (!password) throw new Error('SUPABASE_DB_PASSWORD missing in .env');
  if (!webhookSecret) {
    throw new Error(
      'SUPPORT_WEBHOOK_SECRET missing in .env — add the same value as supabase secrets set WEBHOOK_SECRET'
    );
  }

  return { password, webhookSecret };
}

const { password, webhookSecret } = loadEnv();
const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;
const functionUrl = `https://${PROJECT_REF}.supabase.co/functions/v1/support-notification`;

const client = new Client({ connectionString: url, connectionTimeoutMillis: 90000 });
await client.connect();

await client.query(
  `insert into private.support_notify_config (singleton, function_url, webhook_secret)
   values ($1, $2, $3)
   on conflict (singleton) do update
   set function_url = excluded.function_url,
       webhook_secret = excluded.webhook_secret`,
  [true, functionUrl, webhookSecret]
);

await client.end();
console.log('Support webhook configured:', functionUrl);
