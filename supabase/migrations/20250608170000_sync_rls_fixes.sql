-- Доп. RLS для кросс-устройственной синхронизации

create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
$$;

-- Сотрудник видит своё приглашение по номеру телефона
create policy "invitations_select_by_phone"
  on public.invitations for select to authenticated
  using (
    public.normalize_phone(phone) = public.normalize_phone(
      (select phone from public.profiles where id = auth.uid())
    )
  );

-- Админ ПВЗ: приглашения своего ПВЗ
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

-- Админ ПВЗ: заявки на смены
create policy "shift_requests_admin_select"
  on public.shift_requests for select to authenticated
  using (
    public.my_role() = 'admin'
    and pvz_id = public.my_pvz_id()
  );

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
