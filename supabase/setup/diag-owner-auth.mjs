import fs from 'fs';
import path from 'path';
import pg from 'pg';

const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
const get = (n) => (raw.match(new RegExp(`^${n}=(.+)$`, 'm')) || [])[1]?.trim();
const pw = get('SUPABASE_DB_PASSWORD');
const base = (get('EXPO_PUBLIC_SUPABASE_URL') || '').replace(/\/+$/, '');
const key = get('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || get('EXPO_PUBLIC_SUPABASE_ANON_KEY');

const url = `postgresql://postgres.wygpcndnlxfzbbuogqrt:${encodeURIComponent(pw)}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres`;
const client = new pg.Client({ connectionString: url });
await client.connect();

const fn = await client.query(
  `select pg_get_functiondef(oid) as def, pronargs
   from pg_proc where proname = 'ensure_owner_profile_for_login'`
);
console.log('RPC nargs:', fn.rows[0]?.pronargs);
console.log('RPC has phone:', fn.rows[0]?.def?.includes('phone') ?? false);

const mig = await client.query(
  `select version from supabase_migrations.schema_migrations
   where version >= '20250620160000' order by version`
);
console.log('migrations:', mig.rows.map((r) => r.version));

const recent = await client.query(
  `select p.id, p.role, p.email, p.phone, u.email as auth_email, u.created_at
   from auth.users u
   left join public.profiles p on p.id = u.id
   order by u.created_at desc limit 5`
);
console.log('recent users:', recent.rows);

await client.end();

// REST: signup + RPC
const email = `diag-owner-${Date.now()}@users.pvzpersonal.ru`;
const password = 'TestPass123!';

const signupRes = await fetch(`${base}/auth/v1/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: key },
  body: JSON.stringify({ email, password, data: { role: 'owner' } }),
});
const signupText = await signupRes.text();
let signupJson = {};
try {
  signupJson = JSON.parse(signupText);
} catch {
  signupJson = { raw: signupText.slice(0, 200) };
}
console.log('signup', signupRes.status, signupJson.error || signupJson.msg || 'ok');

const token = signupJson.access_token;
if (!token) {
  console.log('no token, stop');
  process.exit(1);
}

const rpcRes = await fetch(`${base}/rest/v1/rpc/ensure_owner_profile_for_login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ p_email: email }),
});
const rpcText = await rpcRes.text();
console.log('RPC REST', rpcRes.status, rpcText.slice(0, 300));

const profRes = await fetch(
  `${base}/rest/v1/profiles?select=id,role,email,phone&id=eq.${signupJson.user?.id}`,
  { headers: { apikey: key, Authorization: `Bearer ${token}` } }
);
console.log('profile REST', profRes.status, await profRes.text());
