-- При входе владельца: перепривязать ПВЗ по email (старый auth.users.id) и вернуть список.

create or replace function public.list_owner_pvzs_for_login()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  address text,
  work_start text,
  work_end text,
  working_hours text,
  phone text,
  owner_inn text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- ПВЗ, привязанные к профилю, но с другим owner_id.
  update public.pvz p
  set owner_id = pr.id,
      updated_at = now()
  from public.profiles pr
  where pr.id = auth.uid()
    and pr.role = 'owner'
    and p.owner_id is distinct from pr.id
    and (
      p.id = pr.pvz_id
      or p.id = any (coalesce(pr.pvz_ids, '{}'::uuid[]))
    );

  -- ПВЗ прежнего auth-пользователя с тем же email.
  update public.pvz p
  set owner_id = cur.id,
      updated_at = now()
  from auth.users cur
  join auth.users prev on lower(cur.email) = lower(prev.email)
  where cur.id = auth.uid()
    and prev.id = p.owner_id
    and p.owner_id is distinct from cur.id;

  return query
  select distinct on (p.id)
    p.id,
    p.owner_id,
    p.name,
    p.address,
    p.work_start,
    p.work_end,
    p.working_hours,
    p.phone,
    p.owner_inn,
    p.created_at
  from public.pvz p
  left join public.profiles pr on pr.id = auth.uid()
  where p.owner_id = auth.uid()
     or (
       pr.role = 'owner'
       and (
         p.id = pr.pvz_id
         or p.id = any (coalesce(pr.pvz_ids, '{}'::uuid[]))
       )
     )
     or exists (
       select 1
       from auth.users cur
       join auth.users prev on lower(cur.email) = lower(prev.email)
       where cur.id = auth.uid()
         and prev.id = p.owner_id
     )
  order by p.id, p.created_at asc nulls last;
end;
$$;

revoke all on function public.list_owner_pvzs_for_login() from public;
grant execute on function public.list_owner_pvzs_for_login() to authenticated;
