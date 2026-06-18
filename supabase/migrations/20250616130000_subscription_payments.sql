-- Платежи ЮKassa и период оплаченной подписки

alter table public.profiles
  add column if not exists subscription_period_ends_at timestamptz;

comment on column public.profiles.subscription_period_ends_at is
  'Дата окончания оплаченного периода Pro/Enterprise (null = нет оплаченного периода)';

-- ========== ТАБЛИЦА ПЛАТЕЖЕЙ ==========
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text not null,
  amount_rub integer not null,
  currency text not null default 'RUB',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'canceled', 'failed')),
  tier text not null default 'pro',
  pvz_count integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create index if not exists subscription_payments_user_id_idx
  on public.subscription_payments (user_id, created_at desc);

comment on table public.subscription_payments is
  'История платежей за подписку (ЮKassa и др.)';

-- ========== RLS ==========
alter table public.subscription_payments enable row level security;

drop policy if exists subscription_payments_select_own on public.subscription_payments;
create policy subscription_payments_select_own
  on public.subscription_payments
  for select
  to authenticated
  using (user_id = auth.uid());

-- ========== ЗАЩИТА subscription_period_ends_at ==========
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
    or old.subscription_period_ends_at is distinct from new.subscription_period_ends_at
  then
    raise exception 'row-level security violation';
  end if;

  return new;
end;
$$;

-- ========== АКТИВАЦИЯ PRO ПОСЛЕ УСПЕШНОГО ПЛАТЕЖА ==========
create or replace function public.activate_pro_subscription_from_payment(
  p_provider_payment_id text,
  p_provider text default 'yookassa'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.subscription_payments%rowtype;
  new_period_end timestamptz;
begin
  select *
  into pay
  from public.subscription_payments
  where provider = p_provider
    and provider_payment_id = p_provider_payment_id
  for update;

  if not found then
    return false;
  end if;

  if pay.status = 'succeeded' then
    return true;
  end if;

  if pay.status not in ('pending') then
    return false;
  end if;

  update public.subscription_payments
  set
    status = 'succeeded',
    paid_at = now(),
    updated_at = now()
  where id = pay.id;

  select case
    when p.subscription_period_ends_at is not null and p.subscription_period_ends_at > now()
      then p.subscription_period_ends_at + interval '30 days'
    else now() + interval '30 days'
  end
  into new_period_end
  from public.profiles p
  where p.id = pay.user_id;

  update public.profiles
  set
    subscription_tier = 'pro',
    subscription_status = 'active',
    pvz_limit = 999,
    employee_limit = 999,
    subscription_period_ends_at = new_period_end
  where id = pay.user_id
    and role = 'owner';

  return true;
end;
$$;

grant execute on function public.activate_pro_subscription_from_payment(text, text)
  to service_role;

-- ========== УЧЁТ ОПЛАЧЕННОГО ПЕРИОДА В EFFECTIVE TIER ==========
create or replace function public.effective_subscription_tier(p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.subscription_status = 'active'
      and p.subscription_tier = 'enterprise'
      then 'enterprise'
    when p.subscription_status = 'active'
      and p.subscription_tier = 'pro'
      and (
        p.subscription_period_ends_at is null
        or p.subscription_period_ends_at > now()
      )
      then 'pro'
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
