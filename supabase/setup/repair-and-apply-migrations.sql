-- Починка истории миграций + применение недостающих (400, 700)
-- Запуск: Supabase Dashboard → SQL Editor → New query → Run

-- 1) Пометить уже применённые вручную миграции
insert into supabase_migrations.schema_migrations (version)
values
  ('20250608100000'),
  ('20250608110000'),
  ('20250608120000'),
  ('20250608130000'),
  ('20250608150000'),
  ('20250608160000')
on conflict do nothing;

-- 2) user_push_tokens (20250608140000)
create table if not exists public.user_push_tokens (
  user_id text primary key,
  expo_push_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;

drop policy if exists "user_push_tokens_select_authenticated" on public.user_push_tokens;
create policy "user_push_tokens_select_authenticated"
  on public.user_push_tokens for select to authenticated
  using (true);

drop policy if exists "user_push_tokens_upsert_own" on public.user_push_tokens;
create policy "user_push_tokens_upsert_own"
  on public.user_push_tokens for insert to authenticated
  with check (user_id = auth.uid()::text);

drop policy if exists "user_push_tokens_update_own" on public.user_push_tokens;
create policy "user_push_tokens_update_own"
  on public.user_push_tokens for update to authenticated
  using (user_id = auth.uid()::text);

insert into supabase_migrations.schema_migrations (version)
values ('20250608140000')
on conflict do nothing;

-- 3) sync_rls_fixes (20250608170000)
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

drop policy if exists "invitations_select_by_phone" on public.invitations;
create policy "invitations_select_by_phone"
  on public.invitations for select to authenticated
  using (
    public.normalize_phone(phone) = public.normalize_phone(
      (select phone from public.profiles where id = auth.uid())
    )
  );

drop policy if exists "invitations_admin_all" on public.invitations;
create policy "invitations_admin_all"
  on public.invitations for all to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )
  with check (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  );

drop policy if exists "shift_requests_admin_select" on public.shift_requests;
create policy "shift_requests_admin_select"
  on public.shift_requests for select to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  );

drop policy if exists "shift_requests_admin_update" on public.shift_requests;
create policy "shift_requests_admin_update"
  on public.shift_requests for update to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )
  with check (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  );

insert into supabase_migrations.schema_migrations (version)
values ('20250608170000')
on conflict do nothing;

-- Проверка
select version from supabase_migrations.schema_migrations order by version;
