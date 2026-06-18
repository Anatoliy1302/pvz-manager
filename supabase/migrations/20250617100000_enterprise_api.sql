-- Enterprise REST API: api_keys, api_logs, хелперы
-- Запуск: node supabase/setup/apply-migration-17100000.mjs

-- ========== API KEYS ==========
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Default',
  key_prefix text not null,
  key_hash text not null,
  is_active boolean not null default true,
  rate_limit_per_minute integer not null default 100,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key_hash)
);

create index if not exists api_keys_owner_id_idx on public.api_keys (owner_id);
create index if not exists api_keys_key_prefix_idx on public.api_keys (key_prefix);
create index if not exists api_keys_active_idx on public.api_keys (owner_id, is_active)
  where is_active = true;

comment on table public.api_keys is
  'API-ключи для Enterprise REST API. Хранится только SHA-256 хеш, plaintext выдаётся один раз при создании.';

-- ========== API LOGS ==========
create table if not exists public.api_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  api_key_id uuid references public.api_keys (id) on delete set null,
  auth_method text not null check (auth_method in ('jwt', 'api_key')),
  endpoint text not null,
  method text not null,
  status_code integer not null,
  request_ip text,
  user_agent text,
  query_params jsonb not null default '{}'::jsonb,
  response_time_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists api_logs_owner_created_idx
  on public.api_logs (owner_id, created_at desc);

create index if not exists api_logs_rate_limit_idx
  on public.api_logs (owner_id, created_at desc)
  where status_code < 500;

comment on table public.api_logs is
  'Журнал запросов Enterprise REST API для аудита и rate limiting.';

-- ========== RLS ==========
alter table public.api_keys enable row level security;
alter table public.api_logs enable row level security;

drop policy if exists api_keys_select_own on public.api_keys;
create policy api_keys_select_own
  on public.api_keys
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists api_keys_update_own on public.api_keys;
create policy api_keys_update_own
  on public.api_keys
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists api_logs_select_own on public.api_logs;
create policy api_logs_select_own
  on public.api_logs
  for select
  to authenticated
  using (owner_id = auth.uid());

-- Запись логов и ключей — только service role (Edge Functions)

-- ========== ENTERPRISE CHECK ==========
create or replace function public.is_enterprise_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role = 'owner'
      and p.subscription_tier = 'enterprise'
      and p.subscription_status = 'active'
  );
$$;

comment on function public.is_enterprise_owner(uuid) is
  'Проверка: владелец с активным тарифом Enterprise.';

-- ========== API KEY HASH ==========
create or replace function public.hash_api_key(p_plain_key text)
returns text
language sql
immutable
as $$
  select encode(digest(p_plain_key, 'sha256'), 'hex');
$$;

-- ========== CREATE API KEY (возвращает plaintext один раз) ==========
create or replace function public.create_enterprise_api_key(p_name text default 'Default')
returns table (
  id uuid,
  name text,
  key_prefix text,
  api_key text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_plain_key text;
  v_prefix text;
  v_hash text;
  v_id uuid;
  v_created timestamptz;
begin
  if v_owner_id is null then
    raise exception 'Unauthorized';
  end if;

  if not public.is_enterprise_owner(v_owner_id) then
    raise exception 'Enterprise subscription required';
  end if;

  v_plain_key := 'pvz_ent_' || replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');
  v_prefix := left(v_plain_key, 16);
  v_hash := public.hash_api_key(v_plain_key);

  insert into public.api_keys (owner_id, name, key_prefix, key_hash)
  values (v_owner_id, coalesce(nullif(trim(p_name), ''), 'Default'), v_prefix, v_hash)
  returning api_keys.id, api_keys.created_at
  into v_id, v_created;

  return query
  select v_id, coalesce(nullif(trim(p_name), ''), 'Default'), v_prefix, v_plain_key, v_created;
end;
$$;

comment on function public.create_enterprise_api_key(text) is
  'Создать API-ключ Enterprise. Plaintext возвращается один раз — сохраните его.';

revoke all on function public.create_enterprise_api_key(text) from public;
grant execute on function public.create_enterprise_api_key(text) to authenticated;

-- ========== REVOKE API KEY ==========
create or replace function public.revoke_enterprise_api_key(p_key_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null then
    raise exception 'Unauthorized';
  end if;

  update public.api_keys
  set is_active = false, updated_at = now()
  where id = p_key_id and owner_id = v_owner_id and is_active = true;

  return found;
end;
$$;

revoke all on function public.revoke_enterprise_api_key(uuid) from public;
grant execute on function public.revoke_enterprise_api_key(uuid) to authenticated;

-- ========== RATE LIMIT CHECK ==========
create or replace function public.check_api_rate_limit(
  p_owner_id uuid,
  p_limit integer default 100
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer < p_limit
  from public.api_logs
  where owner_id = p_owner_id
    and created_at > now() - interval '1 minute'
    and status_code < 500;
$$;

-- ========== STORAGE: экспорт для 1С ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'api-exports',
  'api-exports',
  false,
  52428800,
  array['text/csv', 'application/json', 'application/xml', 'text/xml']
)
on conflict (id) do nothing;

drop policy if exists api_exports_owner_select on storage.objects;
create policy api_exports_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'api-exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
