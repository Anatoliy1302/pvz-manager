-- RLS: сотрудники видят только свои данные, владельцы — только свой ПВЗ

-- ========== HELPER FUNCTIONS ==========
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_pvz_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pvz_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_pvz_owner(target_pvz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pvz p
    where p.id = target_pvz_id
      and p.owner_id = auth.uid()
  );
$$;

create or replace function public.can_access_pvz(target_pvz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_pvz_owner(target_pvz_id)
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.pvz_id = target_pvz_id
    )
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'admin'
        and target_pvz_id = any (pr.pvz_ids)
    );
$$;

-- ========== ENABLE RLS ON ALL APP TABLES ==========
alter table public.profiles enable row level security;
alter table public.pvz enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_requests enable row level security;
alter table public.swap_requests enable row level security;
alter table public.invitations enable row level security;
alter table public.payments enable row level security;
alter table public.penalties enable row level security;
alter table public.global_salary_settings enable row level security;
alter table public.employee_salary_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_members enable row level security;

-- Включить RLS на любых других пользовательских таблицах в public
do $$
declare
  tbl record;
  app_tables text[] := array[
    'profiles', 'pvz', 'shifts', 'shift_requests', 'swap_requests',
    'invitations', 'payments', 'penalties', 'global_salary_settings',
    'employee_salary_settings', 'notifications', 'chat_rooms',
    'chat_messages', 'chat_members'
  ];
begin
  for tbl in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
      and tablename <> 'schema_migrations'
  loop
    if not (tbl.tablename = any (app_tables)) then
      execute format('alter table public.%I enable row level security', tbl.tablename);
    end if;
  end loop;
end $$;

-- ========== DROP OLD POLICIES (идемпотентность) ==========
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      pol.policyname,
      pol.tablename
    );
  end loop;
end $$;

-- ========== PROFILES ==========
create policy "profiles_select_own_or_pvz_owner"
  on public.profiles for select
  using (
    id = auth.uid()
    or (
      public.current_user_role() = 'owner'
      and pvz_id is not null
      and public.is_pvz_owner(pvz_id)
    )
    or (
      public.current_user_role() = 'admin'
      and pvz_id = public.current_user_pvz_id()
    )
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

-- ========== PVZ ==========
create policy "pvz_select_owner_or_member"
  on public.pvz for select
  using (public.can_access_pvz(id));

create policy "pvz_insert_owner"
  on public.pvz for insert
  with check (owner_id = auth.uid() and public.current_user_role() = 'owner');

create policy "pvz_update_owner"
  on public.pvz for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "pvz_delete_owner"
  on public.pvz for delete
  using (owner_id = auth.uid());

-- ========== SHIFTS (ключевая таблица) ==========
-- Сотрудник: только свои смены
-- Владелец: смены своего ПВЗ
-- Админ: смены своего ПВЗ
create policy "shifts_select_own_or_pvz"
  on public.shifts for select
  using (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (
      public.current_user_role() = 'admin'
      and public.can_access_pvz(pvz_id)
    )
  );

create policy "shifts_insert_pvz_manager"
  on public.shifts for insert
  with check (
    public.is_pvz_owner(pvz_id)
    or (
      public.current_user_role() = 'admin'
      and public.can_access_pvz(pvz_id)
    )
    or employee_id = auth.uid()
  );

create policy "shifts_update_pvz_manager_or_own"
  on public.shifts for update
  using (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (
      public.current_user_role() = 'admin'
      and public.can_access_pvz(pvz_id)
    )
  )
  with check (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (
      public.current_user_role() = 'admin'
      and public.can_access_pvz(pvz_id)
    )
  );

create policy "shifts_delete_pvz_owner"
  on public.shifts for delete
  using (public.is_pvz_owner(pvz_id));

-- ========== SHIFT REQUESTS ==========
create policy "shift_requests_select"
  on public.shift_requests for select
  using (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

create policy "shift_requests_insert_own"
  on public.shift_requests for insert
  with check (employee_id = auth.uid() and public.can_access_pvz(pvz_id));

create policy "shift_requests_update_pvz_manager"
  on public.shift_requests for update
  using (
    public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

-- ========== SWAP REQUESTS ==========
create policy "swap_requests_select"
  on public.swap_requests for select
  using (
    from_employee_id = auth.uid()
    or to_employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

create policy "swap_requests_insert_participant"
  on public.swap_requests for insert
  with check (
    from_employee_id = auth.uid()
    and public.can_access_pvz(pvz_id)
  );

create policy "swap_requests_update_participant_or_manager"
  on public.swap_requests for update
  using (
    from_employee_id = auth.uid()
    or to_employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

-- ========== INVITATIONS ==========
create policy "invitations_select_pvz"
  on public.invitations for select
  using (
    public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

create policy "invitations_manage_owner"
  on public.invitations for all
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

-- ========== PAYMENTS ==========
create policy "payments_select"
  on public.payments for select
  using (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

create policy "payments_manage_owner"
  on public.payments for insert
  with check (public.is_pvz_owner(pvz_id));

create policy "payments_update_owner"
  on public.payments for update
  using (public.is_pvz_owner(pvz_id));

create policy "payments_delete_owner"
  on public.payments for delete
  using (public.is_pvz_owner(pvz_id));

-- ========== PENALTIES ==========
create policy "penalties_select"
  on public.penalties for select
  using (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

create policy "penalties_manage_owner"
  on public.penalties for all
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

-- ========== SALARY SETTINGS ==========
create policy "global_salary_settings_select"
  on public.global_salary_settings for select
  using (public.can_access_pvz(pvz_id));

create policy "global_salary_settings_manage_owner"
  on public.global_salary_settings for all
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "employee_salary_settings_select"
  on public.employee_salary_settings for select
  using (
    employee_id = auth.uid()
    or public.is_pvz_owner(pvz_id)
    or (public.current_user_role() = 'admin' and public.can_access_pvz(pvz_id))
  );

create policy "employee_salary_settings_manage_owner"
  on public.employee_salary_settings for all
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

-- ========== NOTIFICATIONS ==========
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications_insert_own"
  on public.notifications for insert
  with check (user_id = auth.uid());

-- ========== CHAT ==========
create policy "chat_rooms_select_pvz"
  on public.chat_rooms for select
  using (public.can_access_pvz(pvz_id));

create policy "chat_rooms_insert_pvz_member"
  on public.chat_rooms for insert
  with check (public.can_access_pvz(pvz_id));

create policy "chat_messages_select_pvz"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and public.can_access_pvz(r.pvz_id)
    )
  );

create policy "chat_messages_insert_member"
  on public.chat_messages for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms r
      where r.id = room_id and public.can_access_pvz(r.pvz_id)
    )
  );

create policy "chat_members_select_own"
  on public.chat_members for select
  using (user_id = auth.uid());

create policy "chat_members_manage_own"
  on public.chat_members for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
