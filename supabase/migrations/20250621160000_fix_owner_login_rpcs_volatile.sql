-- list_owner_pvzs_for_login: STABLE + UPDATE → 400 "UPDATE is not allowed in a non-volatile function"
-- ensure_owner_profile_for_login: явно VOLATILE + phone NOT NULL

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
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

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

drop function if exists public.ensure_owner_profile_for_login(text);

create or replace function public.ensure_owner_profile_for_login(
  p_email text,
  p_phone text default ''
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_phone text := coalesce(nullif(public.normalize_phone(p_phone), ''), '');
begin
  if auth.uid() is null or v_email = '' then
    return;
  end if;

  perform set_config('pvz.owner_login_profile_sync', '1', true);

  insert into public.profiles (id, email, name, phone, role, status, updated_at)
  values (
    auth.uid(),
    v_email,
    coalesce(nullif(split_part(v_email, '@', 1), ''), 'Владелец'),
    v_phone,
    'owner',
    'active',
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    phone = case
      when coalesce(nullif(public.normalize_phone(profiles.phone), ''), '') = ''
        and v_phone <> ''
      then v_phone
      else profiles.phone
    end,
    role = case
      when profiles.role::text in ('employee', 'pending') then 'owner'::public.user_role
      else profiles.role
    end,
    status = 'active',
    updated_at = now();
end;
$$;

revoke all on function public.list_owner_pvzs_for_login() from public;
grant execute on function public.list_owner_pvzs_for_login() to authenticated;

revoke all on function public.ensure_owner_profile_for_login(text, text) from public;
grant execute on function public.ensure_owner_profile_for_login(text, text) to authenticated;
