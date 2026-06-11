-- RLS для всех таблиц PVZ Manager
-- Владелец: полный доступ к данным своих ПВЗ (pvz.owner_id = auth.uid())
-- Сотрудник: только свои записи (employee_id / user_id = auth.uid())
-- Supabase → SQL Editor → выполнить целиком

-- ========== HELPERS ==========
create or replace function public.is_pvz_owner(target_pvz_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pvz p
    where p.id = target_pvz_id and p.owner_id = auth.uid()
  );
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.my_pvz_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pvz_id from public.profiles where id = auth.uid();
$$;

create or replace function public.room_pvz_id(target_room_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pvz_id from public.chat_rooms where id = target_room_id;
$$;

-- ========== DROP POLICIES ON LISTED TABLES ==========
do $$
declare
  pol record;
  tables text[] := array[
    'profiles','pvz','shifts','shift_requests','swap_requests',
    'invitations','payments','penalties',
    'global_salary_settings','employee_salary_settings',
    'notifications','chat_rooms','chat_messages','chat_members'
  ];
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any (tables)
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- ========== ENABLE RLS ==========
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

-- ========== PROFILES ==========
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (public.my_role() = 'owner' and pvz_id is not null and public.is_pvz_owner(pvz_id))
  );

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- ========== PVZ ==========
create policy "pvz_owner_all"
  on public.pvz for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "pvz_employee_select_own"
  on public.pvz for select to authenticated
  using (public.my_role() = 'employee' and id = public.my_pvz_id());

-- ========== SHIFTS ==========
create policy "shifts_owner_all"
  on public.shifts for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "shifts_employee_select_own"
  on public.shifts for select to authenticated
  using (public.my_role() = 'employee' and employee_id = auth.uid());

create policy "shifts_employee_update_own"
  on public.shifts for update to authenticated
  using (public.my_role() = 'employee' and employee_id = auth.uid())
  with check (public.my_role() = 'employee' and employee_id = auth.uid());

-- ========== SHIFT_REQUESTS ==========
create policy "shift_requests_owner_all"
  on public.shift_requests for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "shift_requests_employee_select_own"
  on public.shift_requests for select to authenticated
  using (public.my_role() = 'employee' and employee_id = auth.uid());

create policy "shift_requests_employee_insert_own"
  on public.shift_requests for insert to authenticated
  with check (
    public.my_role() = 'employee'
    and employee_id = auth.uid()
    and pvz_id = public.my_pvz_id()
  );

-- ========== SWAP_REQUESTS ==========
create policy "swap_requests_owner_all"
  on public.swap_requests for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "swap_requests_employee_select_own"
  on public.swap_requests for select to authenticated
  using (
    public.my_role() = 'employee'
    and (from_employee_id = auth.uid() or to_employee_id = auth.uid())
  );

create policy "swap_requests_employee_insert_own"
  on public.swap_requests for insert to authenticated
  with check (
    public.my_role() = 'employee'
    and from_employee_id = auth.uid()
    and pvz_id = public.my_pvz_id()
  );

-- ========== INVITATIONS (только владелец) ==========
create policy "invitations_owner_all"
  on public.invitations for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

-- ========== PAYMENTS ==========
create policy "payments_owner_all"
  on public.payments for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "payments_employee_select_own"
  on public.payments for select to authenticated
  using (public.my_role() = 'employee' and employee_id = auth.uid());

-- ========== PENALTIES (штрафы/бонусы) ==========
create policy "penalties_owner_all"
  on public.penalties for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "penalties_employee_select_own"
  on public.penalties for select to authenticated
  using (public.my_role() = 'employee' and employee_id = auth.uid());

-- ========== GLOBAL_SALARY_SETTINGS (только владелец) ==========
create policy "global_salary_settings_owner_all"
  on public.global_salary_settings for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

-- ========== EMPLOYEE_SALARY_SETTINGS ==========
create policy "employee_salary_settings_owner_all"
  on public.employee_salary_settings for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "employee_salary_settings_employee_select_own"
  on public.employee_salary_settings for select to authenticated
  using (
    public.my_role() = 'employee'
    and employee_id = auth.uid()
    and pvz_id = public.my_pvz_id()
  );

-- ========== NOTIFICATIONS ==========
create policy "notifications_own_all"
  on public.notifications for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ========== CHAT_ROOMS ==========
create policy "chat_rooms_owner_all"
  on public.chat_rooms for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "chat_rooms_employee_select_own_pvz"
  on public.chat_rooms for select to authenticated
  using (public.my_role() = 'employee' and pvz_id = public.my_pvz_id());

-- ========== CHAT_MESSAGES ==========
create policy "chat_messages_owner_all"
  on public.chat_messages for all to authenticated
  using (public.is_pvz_owner(public.room_pvz_id(room_id)))
  with check (public.is_pvz_owner(public.room_pvz_id(room_id)));

create policy "chat_messages_employee_select_pvz"
  on public.chat_messages for select to authenticated
  using (
    public.my_role() = 'employee'
    and public.room_pvz_id(room_id) = public.my_pvz_id()
  );

create policy "chat_messages_employee_insert_own"
  on public.chat_messages for insert to authenticated
  with check (
    public.my_role() = 'employee'
    and user_id = auth.uid()
    and public.room_pvz_id(room_id) = public.my_pvz_id()
  );

create policy "chat_messages_employee_update_own"
  on public.chat_messages for update to authenticated
  using (public.my_role() = 'employee' and user_id = auth.uid())
  with check (public.my_role() = 'employee' and user_id = auth.uid());

create policy "chat_messages_employee_delete_own"
  on public.chat_messages for delete to authenticated
  using (public.my_role() = 'employee' and user_id = auth.uid());

-- ========== CHAT_MEMBERS ==========
create policy "chat_members_owner_all"
  on public.chat_members for all to authenticated
  using (public.is_pvz_owner(public.room_pvz_id(room_id)))
  with check (public.is_pvz_owner(public.room_pvz_id(room_id)));

create policy "chat_members_employee_own"
  on public.chat_members for all to authenticated
  using (public.my_role() = 'employee' and user_id = auth.uid())
  with check (public.my_role() = 'employee' and user_id = auth.uid());
