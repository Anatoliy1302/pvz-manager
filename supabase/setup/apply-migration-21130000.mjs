#!/usr/bin/env node
import fs from 'node:fs';
import pg from 'pg';

const password = fs
  .readFileSync('.env', 'utf8')
  .match(/^SUPABASE_DB_PASSWORD=(.+)$/m)?.[1]
  ?.trim();
if (!password) throw new Error('SUPABASE_DB_PASSWORD missing in .env');

const sql = fs.readFileSync(
  'supabase/migrations/20250621130000_ensure_staff_profile_login.sql',
  'utf8'
);

const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(password)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log('Applied 20250621130000_ensure_staff_profile_login.sql');
} finally {
  await client.end();
}
