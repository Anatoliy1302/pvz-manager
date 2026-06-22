-- RPC ensure_owner_profile_for_login: обход триггера protect_profile_sensitive_fields при email OTP.

create or replace function public.enforce_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_service_role_request() then
    return new;
  end if;

  if coalesce(current_setting('pvz.owner_login_profile_sync', true), '') = '1' then
    return new;
  end if;

  if old.role is distinct from new.role
    or old.subscription_tier is distinct from new.subscription_tier
    or old.subscription_status is distinct from new.subscription_status
    or old.pvz_limit is distinct from new.pvz_limit
    or old.employee_limit is distinct from new.employee_limit
  then
    raise exception 'row-level security violation';
  end if;

  return new;
end;
$$;

create or replace function public.ensure_owner_profile_for_login(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if auth.uid() is null or v_email = '' then
    return;
  end if;

  perform set_config('pvz.owner_login_profile_sync', '1', true);

  insert into public.profiles (id, email, name, role, status, updated_at)
  values (
    auth.uid(),
    v_email,
    coalesce(nullif(split_part(v_email, '@', 1), ''), 'Владелец'),
    'owner',
    'active',
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    role = case
      when profiles.role::text in ('employee', 'pending') then 'owner'::public.user_role
      else profiles.role
    end,
    status = 'active',
    updated_at = now();
end;
$$;

revoke all on function public.ensure_owner_profile_for_login(text) from public;
grant execute on function public.ensure_owner_profile_for_login(text) to authenticated;
