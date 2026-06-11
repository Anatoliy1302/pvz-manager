-- Обращения в поддержку из приложения (без mailto)
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  topic text not null check (topic in ('bug', 'feature', 'other')),
  message text not null default '',
  user_name text,
  user_role text,
  user_phone text,
  pvz_id text,
  pvz_name text,
  app_version text,
  platform text,
  status text not null default 'new' check (status in ('new', 'read', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_user_id_idx on public.support_messages (user_id);
create index if not exists support_messages_status_idx on public.support_messages (status);
create index if not exists support_messages_created_at_idx on public.support_messages (created_at desc);

alter table public.support_messages enable row level security;

create policy "support_messages_insert_own"
  on public.support_messages for insert to authenticated
  with check (user_id = auth.uid());

create policy "support_messages_select_own"
  on public.support_messages for select to authenticated
  using (user_id = auth.uid());

create policy "support_messages_select_owner"
  on public.support_messages for select to authenticated
  using (public.my_role() = 'owner');
