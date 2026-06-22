-- Пользователи auth.users без profiles (вход владельца ломается на FK pvz.owner_id).
-- handle_new_user: всегда phone='', роль owner из metadata при регистрации.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_role public.user_role;
begin
  v_phone := coalesce(nullif(public.normalize_phone(
    coalesce(new.raw_user_meta_data->>'phone', new.phone, '')
  ), ''), '');

  v_role := 'employee';
  if coalesce(new.raw_user_meta_data->>'role', '') = 'owner' then
    v_role := 'owner';
  end if;

  insert into public.profiles (id, name, phone, email, role, status, updated_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Пользователь'),
    v_phone,
    lower(trim(new.email)),
    v_role,
    'active',
    now()
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, profiles.email),
    phone = case
      when coalesce(nullif(public.normalize_phone(profiles.phone), ''), '') = ''
        and v_phone <> ''
      then v_phone
      else profiles.phone
    end,
    updated_at = now()
  where public.profiles.phone = '' or public.profiles.phone is null;

  return new;
end;
$$;

insert into public.profiles (id, name, phone, email, role, status, updated_at)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Пользователь'
  ),
  '',
  lower(trim(u.email)),
  case
    when coalesce(u.raw_user_meta_data->>'role', '') = 'owner' then 'owner'::public.user_role
    else 'employee'::public.user_role
  end,
  'active'::public.user_status,
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null
  and trim(u.email) <> '';
