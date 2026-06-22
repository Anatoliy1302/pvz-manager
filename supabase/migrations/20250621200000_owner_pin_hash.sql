-- Хеш PIN владельца для удаления аккаунта без OTP (синхронизируется при установке PIN).
alter table public.profiles
  add column if not exists owner_pin_hash text;

create or replace function public.sync_owner_pin_hash(p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if p_hash is null or length(trim(p_hash)) < 8 then
    raise exception 'invalid hash';
  end if;
  update public.profiles
  set owner_pin_hash = trim(p_hash)
  where id = auth.uid()
    and role = 'owner';
end;
$$;

revoke all on function public.sync_owner_pin_hash(text) from public;
grant execute on function public.sync_owner_pin_hash(text) to authenticated;
