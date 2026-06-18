-- Регулярные платежи Pro: сохранённый способ оплаты ЮKassa и автопродление

alter table public.profiles
  add column if not exists yookassa_payment_method_id text,
  add column if not exists subscription_autopay_enabled boolean not null default false;

comment on column public.profiles.yookassa_payment_method_id is
  'ID сохранённого способа оплаты ЮKassa для автоплатежей';
comment on column public.profiles.subscription_autopay_enabled is
  'Автопродление Pro включено (после первой оплаты с save_payment_method)';

alter table public.subscription_payments
  add column if not exists payment_kind text not null default 'initial'
    check (payment_kind in ('initial', 'renewal', 'autopay'));

comment on column public.subscription_payments.payment_kind is
  'Тип платежа: initial — первая покупка, renewal — ручное продление, autopay — автосписание';

create index if not exists subscription_payments_autopay_idx
  on public.subscription_payments (user_id, payment_kind, created_at desc)
  where payment_kind = 'autopay';

-- ========== ЗАЩИТА НОВЫХ ПОЛЕЙ ==========
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
    or old.yookassa_payment_method_id is distinct from new.yookassa_payment_method_id
    or old.subscription_autopay_enabled is distinct from new.subscription_autopay_enabled
  then
    raise exception 'row-level security violation';
  end if;

  return new;
end;
$$;

-- ========== АКТИВАЦИЯ / ПРОДЛЕНИЕ (30 дней) ==========
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

-- Владельцы Pro с истекающей подпиской для автосписания (cron)
create or replace function public.get_profiles_due_for_autopay()
returns table (
  user_id uuid,
  yookassa_payment_method_id text,
  subscription_period_ends_at timestamptz,
  amount_rub integer,
  pvz_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.yookassa_payment_method_id,
    p.subscription_period_ends_at,
    coalesce(
      (
        select sp.amount_rub
        from public.subscription_payments sp
        where sp.user_id = p.id
          and sp.status = 'succeeded'
        order by sp.paid_at desc nulls last, sp.created_at desc
        limit 1
      ),
      case
        when p.is_early_adopter
          and p.early_adopter_ends_at is not null
          and p.early_adopter_ends_at > now()
          then 990
        else 1490
      end * greatest(
        (
          select count(*)::integer
          from public.pvz pv
          where pv.owner_id = p.id
        ),
        1
      )
    ) as amount_rub,
    greatest(
      (
        select count(*)::integer
        from public.pvz pv
        where pv.owner_id = p.id
      ),
      1
    ) as pvz_count
  from public.profiles p
  where p.role = 'owner'
    and p.subscription_tier = 'pro'
    and p.subscription_autopay_enabled = true
    and p.yookassa_payment_method_id is not null
    and p.subscription_period_ends_at is not null
    and p.subscription_period_ends_at <= now() + interval '1 day'
    and p.subscription_period_ends_at > now() - interval '1 day'
    and not exists (
      select 1
      from public.subscription_payments sp
      where sp.user_id = p.id
        and sp.payment_kind = 'autopay'
        and sp.created_at > now() - interval '25 days'
        and sp.status in ('pending', 'succeeded')
    );
$$;

grant execute on function public.get_profiles_due_for_autopay() to service_role;
