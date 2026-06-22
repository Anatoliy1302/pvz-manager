-- Проверка email владельца без отправки OTP (для экрана входа Email → PIN).
create or replace function public.check_owner_email_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.check_owner_email_exists(text) from public;
grant execute on function public.check_owner_email_exists(text) to anon, authenticated;
