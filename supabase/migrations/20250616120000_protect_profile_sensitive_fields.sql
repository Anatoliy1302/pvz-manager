-- Запрет изменения role и полей подписки обычными пользователями (только service_role)

create or replace function public.is_service_role_request()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
  ) = 'service_role';
$$;

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

drop trigger if exists profiles_protect_sensitive_fields on public.profiles;

create trigger profiles_protect_sensitive_fields
  before update on public.profiles
  for each row
  execute function public.enforce_profile_sensitive_fields();
