-- Монетизация: триал Pro, Early Adopter, исправление Enterprise и Pro-доступа

-- ========== НОВЫЕ ПОЛЯ ==========
alter table public.profiles
  add column if not exists is_early_adopter boolean not null default false,
  add column if not exists early_adopter_ends_at timestamptz;

comment on column public.profiles.is_early_adopter is 'Early Adopter: скидка 990 ₽/ПВЗ на 3 месяца';
comment on column public.profiles.early_adopter_ends_at is 'Дата окончания Early Adopter-скидки';

-- ========== ЭФФЕКТИВНЫЙ ТАРИФ (учитывает активный триал) ==========
create or replace function public.effective_subscription_tier(p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.subscription_status = 'active'
      and p.subscription_tier in ('pro', 'enterprise')
      then p.subscription_tier::text
    when p.subscription_status = 'active'
      and p.subscription_tier = 'free'
      and p.trial_ends_at is not null
      and p.trial_ends_at > now()
      then 'pro'
    else 'free'
  end
  from public.profiles p
  where p.id = p_user_id;
$$;

-- ========== АКТИВНАЯ ПОДПИСКА / PRO-ДОСТУП (включая триал) ==========
create or replace function public.has_active_subscription_for(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.effective_subscription_tier(p_user_id), 'free') != 'free';
$$;

create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_subscription_for(auth.uid());
$$;

-- ========== МИНИМАЛЬНЫЙ ТАРИФ (учитывает триал) ==========
create or replace function public.has_minimum_tier(required_tier text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  effective_tier text;
  tier_order text[] := array['free', 'pro', 'enterprise'];
  required_idx int;
  user_idx int;
begin
  effective_tier := public.effective_subscription_tier(auth.uid());

  if effective_tier is null then
    return false;
  end if;

  required_idx := array_position(tier_order, required_tier);
  user_idx := array_position(tier_order, effective_tier);

  if required_idx is null or user_idx is null then
    return false;
  end if;

  return user_idx >= required_idx;
end;
$$;

-- ========== ТРИГГЕР: ТРИАЛ + EARLY ADOPTER ПРИ РЕГИСТРАЦИИ ВЛАДЕЛЬЦА ==========
create or replace function public.set_default_subscription_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count integer;
begin
  if new.role = 'owner' then
    new.subscription_tier := 'free';
    new.subscription_status := 'active';
    new.trial_ends_at := now() + interval '14 days';
    new.pvz_limit := 1;
    new.employee_limit := 3;

    select count(*)
    into owner_count
    from public.profiles
    where role = 'owner';

    if owner_count < 100 then
      new.is_early_adopter := true;
      new.early_adopter_ends_at := now() + interval '3 months';
    else
      new.is_early_adopter := false;
      new.early_adopter_ends_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- ========== ЛИМИТ СОТРУДНИКОВ (учитывает триал) ==========
create or replace function public.can_add_employee(pvz_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  owner_effective_tier text;
  owner_emp_limit integer;
  current_emp_count integer;
begin
  select pv.owner_id
  into owner_id
  from public.pvz pv
  where pv.id = pvz_id;

  if owner_id is null then
    return false;
  end if;

  owner_effective_tier := public.effective_subscription_tier(owner_id);

  if owner_effective_tier in ('pro', 'enterprise') then
    return true;
  end if;

  select employee_limit
  into owner_emp_limit
  from public.profiles
  where id = owner_id;

  select count(*)
  into current_emp_count
  from public.profiles
  where pvz_id = can_add_employee.pvz_id
    and role != 'owner'
    and status = 'active';

  return current_emp_count < coalesce(owner_emp_limit, 3);
end;
$$;

-- ========== ЛИМИТ ПВЗ (учитывает триал) ==========
create or replace function public.can_owner_add_pvz(p_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner_effective_tier text;
  owner_limit integer;
  current_count integer;
begin
  owner_effective_tier := public.effective_subscription_tier(p_owner_id);

  if owner_effective_tier in ('pro', 'enterprise') then
    return true;
  end if;

  select pvz_limit
  into owner_limit
  from public.profiles
  where id = p_owner_id;

  if not found then
    return false;
  end if;

  select count(*)
  into current_count
  from public.pvz
  where owner_id = p_owner_id;

  return current_count < coalesce(owner_limit, 1);
end;
$$;

-- ========== ТРИГГЕР ПВЗ: учитывает effective tier (триал) ==========
create or replace function public.enforce_pvz_creation_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_effective_tier text;
  owner_limit integer;
  current_count integer;
  normalized_inn text;
begin
  normalized_inn := public.normalize_inn(new.owner_inn);
  new.owner_inn := normalized_inn;

  if tg_op = 'INSERT' then
    owner_effective_tier := public.effective_subscription_tier(new.owner_id);

    if coalesce(owner_effective_tier, 'free') = 'free' then
      select pvz_limit
      into owner_limit
      from public.profiles
      where id = new.owner_id;

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

-- ========== ЦЕНА PRO (Early Adopter 990 ₽ на 3 месяца) ==========
create or replace function public.get_pro_price_rub(p_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.is_early_adopter
      and p.early_adopter_ends_at is not null
      and p.early_adopter_ends_at > now()
      then 990
    else 1490
  end
  from public.profiles p
  where p.id = p_user_id;
$$;
