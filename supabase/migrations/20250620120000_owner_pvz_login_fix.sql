-- ПВЗ владельца: починка owner_id + RPC для входа после email OTP.

update public.pvz p
set owner_id = pr.id,
    updated_at = now()
from public.profiles pr
where pr.role = 'owner'
  and p.owner_id is distinct from pr.id
  and (
    p.id = pr.pvz_id
    or p.id = any (coalesce(pr.pvz_ids, '{}'::uuid[]))
  );

-- ПВЗ с тем же email владельца, но другим owner_id (старый auth id).
update public.pvz p
set owner_id = u.id,
    updated_at = now()
from auth.users u
join public.profiles pr on pr.id = u.id and pr.role = 'owner'
where p.owner_id is distinct from u.id
  and exists (
    select 1
    from auth.users old_u
    where old_u.id = p.owner_id
      and lower(old_u.email) = lower(u.email)
  );

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
language sql
stable
security definer
set search_path = public
as $$
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
  where auth.uid() is not null
    and (
      p.owner_id = auth.uid()
      or (
        pr.role = 'owner'
        and (
          p.id = pr.pvz_id
          or p.id = any (coalesce(pr.pvz_ids, '{}'::uuid[]))
        )
      )
    )
  order by p.id, p.created_at asc nulls last;
$$;

revoke all on function public.list_owner_pvzs_for_login() from public;
grant execute on function public.list_owner_pvzs_for_login() to authenticated;
