-- Критичные исправления RLS + восстановление прав admin + realtime для shifts/chat

-- ========== HELPERS ==========
create or replace function public.can_admin_access_pvz(target_pvz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.role = 'admin'
      and (
        pr.pvz_id = target_pvz_id
        or target_pvz_id = any (coalesce(pr.pvz_ids, '{}'::uuid[]))
      )
  );
$$;

create or replace function public.can_read_push_token(target_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_user_id = auth.uid()::text
    or exists (
      select 1
      from public.profiles pr
      join public.pvz p on p.id = pr.pvz_id
      where pr.id::text = target_user_id
        and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.profiles pr
      where pr.id::text = target_user_id
        and pr.pvz_id is not null
        and public.can_admin_access_pvz(pr.pvz_id)
    );
$$;

-- ========== SECURITY: роль только employee при регистрации ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Пользователь'),
    coalesce(new.raw_user_meta_data->>'phone', new.phone, ''),
    new.email,
    'employee'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ========== SECURITY: push-токены — не открывать всем ==========
drop policy if exists "user_push_tokens_select_authenticated" on public.user_push_tokens;
drop policy if exists "user_push_tokens_select_scoped" on public.user_push_tokens;

create policy "user_push_tokens_select_scoped"
  on public.user_push_tokens for select to authenticated
  using (public.can_read_push_token(user_id));

-- ========== SECURITY: support_messages — owner видит только свои ПВЗ ==========
drop policy if exists "support_messages_select_owner" on public.support_messages;
drop policy if exists "Owner can view all support messages" on public.support_messages;

create policy "support_messages_select_owner"
  on public.support_messages for select to authenticated
  using (
    public.my_role() = 'owner'
    and exists (
      select 1
      from public.profiles pr
      join public.pvz p on p.id = pr.pvz_id
      where pr.id = support_messages.user_id
        and p.owner_id = auth.uid()
    )
  );

-- ========== ADMIN: profiles ==========
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select"
  on public.profiles for select to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id is not null
    and public.can_admin_access_pvz(pvz_id)
  );

-- ========== ADMIN: pvz ==========
drop policy if exists "pvz_admin_select" on public.pvz;
create policy "pvz_admin_select"
  on public.pvz for select to authenticated
  using (public.can_admin_access_pvz(id));

-- ========== ADMIN: shifts ==========
drop policy if exists "shifts_admin_all" on public.shifts;
create policy "shifts_admin_all"
  on public.shifts for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

-- ========== ADMIN: swap_requests ==========
drop policy if exists "swap_requests_admin_all" on public.swap_requests;
create policy "swap_requests_admin_all"
  on public.swap_requests for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

-- ========== ADMIN: payments ==========
drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_admin_all"
  on public.payments for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

-- ========== ADMIN: penalties ==========
drop policy if exists "penalties_admin_all" on public.penalties;
create policy "penalties_admin_all"
  on public.penalties for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

-- ========== ADMIN: salary settings ==========
drop policy if exists "global_salary_settings_admin_all" on public.global_salary_settings;
create policy "global_salary_settings_admin_all"
  on public.global_salary_settings for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

drop policy if exists "employee_salary_settings_admin_all" on public.employee_salary_settings;
create policy "employee_salary_settings_admin_all"
  on public.employee_salary_settings for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

-- ========== ADMIN: chat ==========
drop policy if exists "chat_rooms_admin_all" on public.chat_rooms;
create policy "chat_rooms_admin_all"
  on public.chat_rooms for all to authenticated
  using (public.can_admin_access_pvz(pvz_id))
  with check (public.can_admin_access_pvz(pvz_id));

drop policy if exists "chat_messages_admin_all" on public.chat_messages;
create policy "chat_messages_admin_all"
  on public.chat_messages for all to authenticated
  using (public.can_admin_access_pvz(public.room_pvz_id(room_id)))
  with check (public.can_admin_access_pvz(public.room_pvz_id(room_id)));

drop policy if exists "chat_members_admin_all" on public.chat_members;
create policy "chat_members_admin_all"
  on public.chat_members for all to authenticated
  using (public.can_admin_access_pvz(public.room_pvz_id(room_id)))
  with check (public.can_admin_access_pvz(public.room_pvz_id(room_id)));

-- ========== REALTIME: shifts + chat (используются в приложении) ==========
do $$ begin
  alter publication supabase_realtime add table public.shifts;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.chat_members;
exception when duplicate_object then null;
end $$;
