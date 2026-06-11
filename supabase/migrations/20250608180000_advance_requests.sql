-- Запросы на аванс

create table if not exists public.advance_requests (
  id uuid primary key default gen_random_uuid(),
  pvz_id uuid not null references public.pvz (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  employee_name text not null,
  amount numeric(12, 2) not null,
  period_start date not null,
  period_end date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists advance_requests_pvz_id_idx on public.advance_requests (pvz_id);
create index if not exists advance_requests_employee_id_idx on public.advance_requests (employee_id);

alter table public.advance_requests enable row level security;

create policy "advance_requests_owner_all"
  on public.advance_requests for all to authenticated
  using (public.is_pvz_owner(pvz_id))
  with check (public.is_pvz_owner(pvz_id));

create policy "advance_requests_employee_select_own"
  on public.advance_requests for select to authenticated
  using (public.my_role() = 'employee' and employee_id = auth.uid());

create policy "advance_requests_employee_insert_own"
  on public.advance_requests for insert to authenticated
  with check (
    public.my_role() = 'employee'
    and employee_id = auth.uid()
    and pvz_id = public.my_pvz_id()
  );

create policy "advance_requests_admin_select"
  on public.advance_requests for select to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  );

create policy "advance_requests_admin_update"
  on public.advance_requests for update to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  )
  with check (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  );
