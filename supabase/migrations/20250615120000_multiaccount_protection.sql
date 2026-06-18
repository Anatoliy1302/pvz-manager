-- Защита от мультиаккаунтинга: уникальный телефон, ИНН владельца, лимит ПВЗ на free-тарифе

-- ========== NORMALIZE INN ==========
create or replace function public.normalize_inn(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g');
$$;

-- ========== PROFILES: УНИКАЛЬНЫЙ ТЕЛЕФОН ==========
-- Пустые номера не участвуют в уникальности (регистрация до привязки телефона).
create unique index if not exists profiles_phone_normalized_unique
  on public.profiles (public.normalize_phone(phone))
  where public.normalize_phone(phone) <> '';

create or replace function public.enforce_profiles_phone_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
begin
  normalized_phone := public.normalize_phone(new.phone);

  if normalized_phone = '' then
    return new;
  end if;

  new.phone := normalized_phone;

  if exists (
    select 1
    from public.profiles p
    where public.normalize_phone(p.phone) = normalized_phone
      and p.id is distinct from new.id
  ) then
    raise exception 'Пользователь с таким номером телефона уже зарегистрирован';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_phone_unique on public.profiles;
create trigger profiles_phone_unique
  before insert or update of phone on public.profiles
  for each row
  execute function public.enforce_profiles_phone_unique();

-- ========== PVZ: ИНН ВЛАДЕЛЬЦА ==========
alter table public.pvz
  add column if not exists owner_inn text not null default '';

comment on column public.pvz.owner_inn is 'ИНН владельца ПВЗ (нормализованные цифры)';

create unique index if not exists pvz_owner_inn_unique
  on public.pvz (public.normalize_inn(owner_inn))
  where public.normalize_inn(owner_inn) <> '';

-- ========== ХЕЛПЕР: ЛИМИТ ПВЗ ДЛЯ ВЛАДЕЛЬЦА ==========
create or replace function public.can_owner_add_pvz(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_tier public.subscription_tier;
  owner_limit integer;
  current_count integer;
begin
  select subscription_tier, pvz_limit
  into owner_tier, owner_limit
  from public.profiles
  where id = p_owner_id;

  if not found then
    return false;
  end if;

  if owner_tier in ('pro', 'enterprise') then
    return true;
  end if;

  select count(*)
  into current_count
  from public.pvz
  where owner_id = p_owner_id;

  return current_count < coalesce(owner_limit, 1);
end;
$$;

-- ========== ТРИГГЕР: ПРАВИЛА СОЗДАНИЯ / ОБНОВЛЕНИЯ ПВЗ ==========
create or replace function public.enforce_pvz_creation_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_tier public.subscription_tier;
  owner_limit integer;
  current_count integer;
  normalized_inn text;
begin
  normalized_inn := public.normalize_inn(new.owner_inn);
  new.owner_inn := normalized_inn;

  if tg_op = 'INSERT' then
    select subscription_tier, pvz_limit
    into owner_tier, owner_limit
    from public.profiles
    where id = new.owner_id;

    if coalesce(owner_tier, 'free') = 'free' then
      select count(*)
      into current_count
      from public.pvz
      where owner_id = new.owner_id;

      if current_count >= coalesce(owner_limit, 1) then
        raise exception 'Для управления вторым ПВЗ перейдите на Pro-тариф';
      end if;

      if normalized_inn = '' then
        raise exception 'Укажите ИНН владельца ПВЗ';
      end if;

      if exists (
        select 1
        from public.pvz p
        where public.normalize_inn(p.owner_inn) = normalized_inn
      ) then
        raise exception 'ПВЗ с таким ИНН уже зарегистрирован в системе';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and normalized_inn <> '' then
    if exists (
      select 1
      from public.pvz p
      where public.normalize_inn(p.owner_inn) = normalized_inn
        and p.id is distinct from new.id
    ) then
      raise exception 'ПВЗ с таким ИНН уже зарегистрирован в системе';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists pvz_creation_rules on public.pvz;
create trigger pvz_creation_rules
  before insert or update of owner_inn on public.pvz
  for each row
  execute function public.enforce_pvz_creation_rules();

-- ========== RLS: ЛИМИТ ПВЗ ПРИ INSERT ==========
drop policy if exists "pvz_owner_all" on public.pvz;

create policy "pvz_owner_select"
  on public.pvz for select to authenticated
  using (owner_id = auth.uid());

create policy "pvz_owner_insert"
  on public.pvz for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.can_owner_add_pvz(auth.uid())
  );

create policy "pvz_owner_update"
  on public.pvz for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "pvz_owner_delete"
  on public.pvz for delete to authenticated
  using (owner_id = auth.uid());
