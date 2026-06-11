-- Push-токены для доставки уведомлений между устройствами
create table if not exists public.user_push_tokens (
  user_id text primary key,
  expo_push_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_push_tokens enable row level security;

create policy "user_push_tokens_select_authenticated"
  on public.user_push_tokens for select to authenticated
  using (true);

create policy "user_push_tokens_upsert_own"
  on public.user_push_tokens for insert to authenticated
  with check (user_id = auth.uid()::text);

create policy "user_push_tokens_update_own"
  on public.user_push_tokens for update to authenticated
  using (user_id = auth.uid()::text);
