// src/hooks/useSubscription.ts
// Хук для доступа к статусу подписки из любого компонента

import { useMemo } from 'react';
import {
  getSubscriptionStatus,
  isSubscriptionStatusActive,
  type SubscriptionStatus,
} from '../subscription/subscriptionStatus';
import { useAuth } from '../context/AuthContext';
import subscriptionService, {
  FREE_EMPLOYEE_LIMIT,
  FREE_PVZ_LIMIT,
  getEffectiveTier,
  getProPriceRub,
  getDaysUntilSubscriptionEnds,
  hasProAccess,
  isEarlyAdopterActive,
  isRenewalReminderDue,
  isTrialActive,
  type Subscription,
  type SubscriptionLimitType,
  type SubscriptionTier,
} from '../services/subscriptionService';

export type ProFeature =
  | 'salary_calculation'
  | 'analytics'
  | 'export'
  | 'employee_limits'
  | 'multi_pvz';

const DEFAULT_SUBSCRIPTION: Subscription = {
  tier: 'free',
  status: 'active',
  trialEndsAt: null,
  subscriptionPeriodEndsAt: null,
  isEarlyAdopter: false,
  earlyAdopterEndsAt: null,
  pvzLimit: FREE_PVZ_LIMIT,
  employeeLimit: FREE_EMPLOYEE_LIMIT,
};

export function useSubscription() {
  const { subscription } = useAuth();

  return useMemo(() => {
    const sub = subscription ?? DEFAULT_SUBSCRIPTION;
    const status = sub.status ?? 'active';
    const subscriptionStatus: SubscriptionStatus = getSubscriptionStatus(sub);
    const tier = sub.tier ?? 'free';
    const trialActive = isTrialActive(sub);
    const earlyAdopterActive = isEarlyAdopterActive(sub);
    const proAccess = hasProAccess(sub);
    const effectiveTier = getEffectiveTier(sub);
    const proPriceRub = getProPriceRub(sub);

    const canAccessFeature = (feature: ProFeature): boolean => {
      if (status !== 'active' && !(status === 'canceled' && proAccess)) return false;
      if (proAccess) return true;
      if (feature === 'employee_limits' || feature === 'multi_pvz') return false;
      return false;
    };

    return {
      subscription: sub,
      subscriptionStatus,
      isSubscriptionStatusActive: isSubscriptionStatusActive(subscriptionStatus),
      subscriptionTier: tier as SubscriptionTier,
      effectiveTier,
      isPro: proAccess,
      isTrialActive: trialActive,
      isEarlyAdopterActive: earlyAdopterActive,
      isRenewalReminderDue: isRenewalReminderDue(sub),
      daysUntilSubscriptionEnds: getDaysUntilSubscriptionEnds(sub),
      subscriptionAutopayEnabled: Boolean(sub.subscriptionAutopayEnabled),
      proPriceRub,
      canAccessFeature,
      getStatus: () => subscriptionService.getStatus(sub),
      checkLimit: (type: SubscriptionLimitType, currentCount: number) =>
        subscriptionService.checkLimit(sub, type, currentCount),
    };
  }, [subscription]);
}
