-- Отменённая подписка: доступ Pro до конца оплаченного периода (+ grace 3 дня)

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
    when p.subscription_status in ('active', 'canceled')
      and p.subscription_tier = 'pro'
      and (
        p.subscription_period_ends_at is null
        or (
          p.subscription_period_ends_at > now() - interval '3 days'
          and exists (
            select 1
            from public.subscription_payments sp
            where sp.user_id = p.id
              and sp.status = 'succeeded'
          )
        )
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

comment on function public.effective_subscription_tier(uuid) is
  'Эффективный тариф: canceled Pro сохраняет доступ до subscription_period_ends_at + grace 3 дня';

-- Автосписание только для активных (не отменённых) подписок
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
    and p.subscription_status = 'active'
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
