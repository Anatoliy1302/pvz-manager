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

const statements = [
  `insert into supabase_migrations.schema_migrations (version) values ('20250608140000') on conflict do nothing`,
  `create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$`,
  `drop policy if exists "invitations_select_by_phone" on public.invitations`,
  `create policy "invitations_select_by_phone"
  on public.invitations for select to authenticated
  using (
    public.normalize_phone(phone) = public.normalize_phone(
      (select phone from public.profiles where id = auth.uid())
    )
  )`,
  `drop policy if exists "invitations_admin_all" on public.invitations`,
  `create policy "invitations_admin_all"
  on public.invitations for all to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )
  with check (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )`,
  `drop policy if exists "shift_requests_admin_select" on public.shift_requests`,
  `create policy "shift_requests_admin_select"
  on public.shift_requests for select to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )`,
  `drop policy if exists "shift_requests_admin_update" on public.shift_requests`,
  `create policy "shift_requests_admin_update"
  on public.shift_requests for update to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )
  with check (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )`,
  `insert into supabase_migrations.schema_migrations (version) values ('20250608170000') on conflict do nothing`,
];

for (let i = 0; i < statements.length; i++) {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 90000 });
  await client.connect();
  console.log(`[${i + 1}/${statements.length}] running...`);
  await client.query(statements[i]);
  await client.end();
}

const verify = new Client({ connectionString: url, connectionTimeoutMillis: 60000 });
await verify.connect();
const { rows } = await verify.query(
  'select version from supabase_migrations.schema_migrations order by version'
);
console.log('Migrations:', rows.map((r) => r.version).join(', '));
await verify.end();
