-- После email OTP владельца: профиль с role=owner (обход триггера protect_profile_sensitive_fields).

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
