-- Добавление полей подписки в таблицу profiles
-- Запуск: Supabase Dashboard → SQL Editor или supabase db push

-- ========== ENUMS ==========
do $$ begin
  create type public.subscription_tier as enum ('free', 'pro', 'enterprise');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.subscription_status as enum ('active', 'past_due', 'canceled', 'expired');
exception when duplicate_object then null;
end $$;

-- ========== ДОБАВЛЕНИЕ ПОЛЕЙ В PROFILES ==========
alter table public.profiles
  add column if not exists subscription_tier public.subscription_tier not null default 'free',
  add column if not exists subscription_status public.subscription_status not null default 'active',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists pvz_limit integer not null default 1,
  add column if not exists employee_limit integer not null default 3;

comment on column public.profiles.subscription_tier is 'Текущий тариф: free, pro, enterprise';
comment on column public.profiles.subscription_status is 'Статус подписки: active, past_due, canceled, expired';
comment on column public.profiles.trial_ends_at is 'Дата окончания пробного периода (null = нет триала)';
comment on column public.profiles.pvz_limit is 'Максимальное количество ПВЗ для тарифа';
comment on column public.profiles.employee_limit is 'Максимальное количество сотрудников для тарифа';

-- ========== ТРИГГЕР: УСТАНОВКА ЛИМИТОВ ПРИ СОЗДАНИИ ПОЛЬЗОВАТЕЛЯ ==========
create or replace function public.set_default_subscription_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'owner' then
    new.subscription_tier := 'free';
    new.subscription_status := 'active';
    new.trial_ends_at := now() + interval '14 days';
    new.pvz_limit := 1;
    new.employee_limit := 3;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_insert_set_limits on public.profiles;
create trigger on_profile_insert_set_limits
  before insert on public.profiles
  for each row
  when (new.role = 'owner')
  execute function public.set_default_subscription_limits();

-- ========== ХЕЛПЕР: ПРОВЕРКА АКТИВНОЙ ПОДПИСКИ ==========
create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and subscription_tier != 'free'
      and subscription_status = 'active'
      and (
        trial_ends_at is null
        or trial_ends_at > now()
      )
  );
$$;

-- ========== ХЕЛПЕР: ПРОВЕРКА МИНИМАЛЬНОГО ТАРИФА ==========
create or replace function public.has_minimum_tier(required_tier text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  user_tier text;
  tier_order text[] := array['free', 'pro', 'enterprise'];
  required_idx int;
  user_idx int;
begin
  select subscription_tier::text into user_tier
  from public.profiles where id = auth.uid();

  if user_tier is null then
    return false;
  end if;

  required_idx := array_position(tier_order, required_tier);
  user_idx := array_position(tier_order, user_tier);

  return user_idx >= required_idx;
end;
$$;

-- ========== ХЕЛПЕР: ТЕКУЩИЙ ТАРИФ ПОЛЬЗОВАТЕЛЯ ==========
create or replace function public.current_subscription_tier()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select subscription_tier::text from public.profiles where id = auth.uid();
$$;

-- ========== ХЕЛПЕР: ЛИМИТ СОТРУДНИКОВ ==========
create or replace function public.can_add_employee(pvz_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_sub_tier public.subscription_tier;
  owner_emp_limit integer;
  current_emp_count integer;
begin
  -- Находим владельца ПВЗ
  select p.owner_id into owner_sub_tier
  from public.pvz pv
  join public.profiles p on p.id = pv.owner_id
  where pv.id = pvz_id;

  -- Получаем тариф и лимит владельца
  select subscription_tier, employee_limit
  into owner_sub_tier, owner_emp_limit
  from public.profiles
  where id = (
    select owner_id from public.pvz where id = pvz_id
  );

  -- Pro и Enterprise без ограничений
  if owner_sub_tier in ('pro', 'enterprise') then
    return true;
  end if;

  -- Считаем активных сотрудников в ПВЗ
  select count(*)
  into current_emp_count
  from public.profiles
  where pvz_id = pvz_id
    and role != 'owner'
    and status = 'active';

  return current_emp_count < owner_emp_limit;
end;
$$;
