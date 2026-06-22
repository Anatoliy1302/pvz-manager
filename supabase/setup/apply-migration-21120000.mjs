/**
 * Применить миграцию normalize_phone + invite login.
 * Run: node supabase/setup/apply-migration-21120000.mjs
 */
import fs from 'fs';
import { loadAccessToken } from './loadAccessToken.mjs';

const PROJECT_REF = 'wygpcndnlxfzbbuogqrt';
const sql = fs.readFileSync(
  'supabase/migrations/20250621120000_fix_phone_normalize_invite_login.sql',
  'utf8'
);

const token = loadAccessToken();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN required in .env');
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log('Status:', res.status);
console.log(text.slice(0, 500));
process.exit(res.ok ? 0 : 1);
