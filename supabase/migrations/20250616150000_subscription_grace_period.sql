-- Grace period 3 дня после окончания оплаченного периода Pro
-- (защита от сбоев вебхуков ЮKassa)

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
  'Эффективный тариф с учётом триала и grace period 3 дня после subscription_period_ends_at (при наличии успешного платежа)';
