-- События аналитики приложения (без Firebase)
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  event_name text not null,
  event_data jsonb,
  screen text,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_user_id on public.analytics_events (user_id);
create index if not exists idx_analytics_event_name on public.analytics_events (event_name);
create index if not exists idx_analytics_created_at on public.analytics_events (created_at desc);
create index if not exists idx_analytics_event_created on public.analytics_events (event_name, created_at desc);

alter table public.analytics_events enable row level security;

-- Клиент только пишет свои события; чтение — через Supabase Dashboard / service role
create policy "analytics_events_insert_own"
  on public.analytics_events
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

grant insert on table public.analytics_events to authenticated;

comment on table public.analytics_events is 'In-app analytics events (screen views, sign-in, key actions)';
