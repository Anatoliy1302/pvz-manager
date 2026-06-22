-- Вход сотрудника: lookup приглашения по телефону без profiles.phone (до/после phone OTP)

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

revoke all on function public.auth_phone_normalized() from public;
grant execute on function public.auth_phone_normalized() to authenticated;

-- Anon: проверка до отправки SMS (приглашение уже в облаке)
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

revoke all on function public.check_pending_invitation_for_phone(text, public.user_role) from public;
grant execute on function public.check_pending_invitation_for_phone(text, public.user_role) to anon, authenticated;

-- Authenticated: получить приглашение после phone OTP (телефон = auth.users.phone)
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
    and public.auth_phone_normalized() <> ''
    and public.normalize_phone(p_phone) = public.auth_phone_normalized()
  order by i.created_at desc
  limit 1;
$$;

revoke all on function public.get_pending_invitation_for_login(text, public.user_role) from public;
grant execute on function public.get_pending_invitation_for_login(text, public.user_role) to authenticated;
