-- Нормализация телефона 8→7 и надёжный lookup приглашений для входа сотрудника

create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  digits := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if length(digits) = 11 and left(digits, 1) = '8' then
    digits := '7' || substring(digits from 2);
  elsif length(digits) = 10 then
    digits := '7' || digits;
  end if;
  return digits;
end;
$$;

create or replace function public.auth_phone_normalized()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_phone(
    coalesce(
      (select phone from auth.users where id = auth.uid()),
      (select phone from public.profiles where id = auth.uid())
    )
  );
$$;

create or replace function public.check_pending_invitation_for_phone(
  p_phone text,
  p_role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.invitations i
    where i.status = 'pending'
      and i.role = p_role
      and public.normalize_phone(i.phone) = public.normalize_phone(p_phone)
  );
$$;

-- После phone OTP: p_phone должен совпадать с телефоном сессии (защита от чужих приглашений)
create or replace function public.get_pending_invitation_for_login(
  p_phone text,
  p_role public.user_role
)
returns setof public.invitations
language sql
stable
security definer
set search_path = public
as $$
  select i.*
  from public.invitations i
  where i.status = 'pending'
    and i.role = p_role
    and public.normalize_phone(i.phone) = public.normalize_phone(p_phone)
    and public.normalize_phone(p_phone) = public.auth_phone_normalized()
  order by i.created_at desc
  limit 1;
$$;
