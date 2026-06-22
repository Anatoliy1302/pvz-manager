-- ensure_owner_profile_for_login: profiles.phone NOT NULL — вставка без phone давала 23502.

drop function if exists public.ensure_owner_profile_for_login(text);

create or replace function public.ensure_owner_profile_for_login(
  p_email text,
  p_phone text default ''
)
returns void
language plpgsql
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

revoke all on function public.ensure_owner_profile_for_login(text, text) from public;
grant execute on function public.ensure_owner_profile_for_login(text, text) to authenticated;
