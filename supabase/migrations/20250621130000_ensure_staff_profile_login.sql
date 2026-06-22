-- Вход сотрудника/админа по phone OTP: безопасное создание и финализация profiles (обход enforce_profile_sensitive_fields).

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

  if coalesce(current_setting('pvz.staff_login_profile_sync', true), '') = '1' then
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

-- После phone OTP: только телефон + pending-заготовка (не ломает active admin/employee при повторном входе)
create or replace function public.ensure_phone_profile_for_login(
  p_phone text,
  p_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  v_name text := coalesce(nullif(trim(p_name), ''), v_phone);
begin
  if auth.uid() is null or v_phone = '' then
    return;
  end if;

  perform set_config('pvz.staff_login_profile_sync', '1', true);

  insert into public.profiles (id, name, phone, role, status, permissions, updated_at)
  values (
    auth.uid(),
    v_name,
    v_phone,
    'employee',
    'pending',
    '{}'::jsonb,
    now()
  )
  on conflict (id) do update set
    phone = excluded.phone,
    name = case
      when profiles.status = 'pending'::public.user_status then excluded.name
      else profiles.name
    end,
    updated_at = now();
end;
$$;

revoke all on function public.ensure_phone_profile_for_login(text, text) from public;
grant execute on function public.ensure_phone_profile_for_login(text, text) to authenticated;

-- После PIN / принятия приглашения: role, pvz_id, pvz_ids, permissions
create or replace function public.ensure_staff_profile_for_login(
  p_name text,
  p_role public.user_role,
  p_pvz_id uuid default null,
  p_pvz_ids uuid[] default '{}',
  p_permission_level text default null,
  p_permissions jsonb default '{}'::jsonb,
  p_status public.user_status default 'active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.auth_phone_normalized();
begin
  if auth.uid() is null then
    return;
  end if;

  if v_phone = '' then
    select public.normalize_phone(phone) into v_phone
    from public.profiles
    where id = auth.uid();
  end if;

  perform set_config('pvz.staff_login_profile_sync', '1', true);

  insert into public.profiles (
    id, name, phone, role, status, pvz_id, pvz_ids, permission_level, permissions, updated_at
  )
  values (
    auth.uid(),
    coalesce(nullif(trim(p_name), ''), v_phone, 'Сотрудник'),
    coalesce(v_phone, ''),
    p_role,
    p_status,
    p_pvz_id,
    coalesce(p_pvz_ids, '{}'::uuid[]),
    p_permission_level,
    coalesce(p_permissions, '{}'::jsonb),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    phone = coalesce(nullif(excluded.phone, ''), profiles.phone),
    role = excluded.role,
    status = excluded.status,
    pvz_id = excluded.pvz_id,
    pvz_ids = excluded.pvz_ids,
    permission_level = excluded.permission_level,
    permissions = excluded.permissions,
    updated_at = now();
end;
$$;

revoke all on function public.ensure_staff_profile_for_login(
  text, public.user_role, uuid, uuid[], text, jsonb, public.user_status
) from public;
grant execute on function public.ensure_staff_profile_for_login(
  text, public.user_role, uuid, uuid[], text, jsonb, public.user_status
) to authenticated;
