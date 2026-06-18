// src/services/subscriptionService.ts
// Сервис для работы с подпиской: получение статуса, лимитов, кеширование

import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { SUBSCRIPTION_RENEWAL_REMINDER_DAYS } from '../constants/subscriptionProduct';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

export interface Subscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  subscriptionPeriodEndsAt: string | null;
  /** Есть хотя бы один успешный платёж в subscription_payments */
  hasSuccessfulPayment?: boolean;
  /** Автопродление через сохранённую карту ЮKassa */
  subscriptionAutopayEnabled?: boolean;
  isEarlyAdopter: boolean;
  earlyAdopterEndsAt: string | null;
  pvzLimit: number;
  employeeLimit: number;
}

export const SUBSCRIPTION_STORAGE_KEY = 'subscription';
export const FREE_EMPLOYEE_LIMIT = 3;
export const FREE_PVZ_LIMIT = 1;
export const PRO_EMPLOYEE_LIMIT = 999;
export const PRO_PVZ_LIMIT = 999;
export const ENTERPRISE_EMPLOYEE_LIMIT = 9999;
export const ENTERPRISE_PVZ_LIMIT = 9999;
export const EARLY_ADOPTER_PRICE_RUB = 990;
export const EARLY_ADOPTER_LIMIT = 100;
export const TRIAL_DAYS = 14;
/** Дни grace period после subscription_period_ends_at (при наличии успешного платежа) */
export const SUBSCRIPTION_GRACE_DAYS = 3;

/** Цены тарифов (отображение в UI; реальная оплата — через платёжный SDK) */
export const PLAN_PRICING = {
  free: { amountRub: 0, perPvz: false },
  pro: { amountRub: 1490, perPvz: true },
  enterprise: {
    minPvz: 5,
    priceRubPerPvz: 990,
    minMonthlyRub: 4950,
    perPvz: true,
  },
} as const;

export function formatPlanPrice(amountRub: number, locale: 'ru' | 'en' = 'ru'): string {
  const formatted = amountRub.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');
  return locale === 'ru' ? `${formatted} ₽` : `$${Math.round(amountRub / 100)}`;
}

const DEFAULT_FREE_SUBSCRIPTION: Subscription = {
  tier: 'free',
  status: 'active',
  trialEndsAt: null,
  subscriptionPeriodEndsAt: null,
  isEarlyAdopter: false,
  earlyAdopterEndsAt: null,
  pvzLimit: FREE_PVZ_LIMIT,
  employeeLimit: FREE_EMPLOYEE_LIMIT,
};

export function getDaysUntilSubscriptionEnds(subscription: Subscription): number | null {
  if (!subscription.subscriptionPeriodEndsAt) return null;
  return Math.ceil(
    (new Date(subscription.subscriptionPeriodEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

/** Напоминание о продлении за SUBSCRIPTION_RENEWAL_REMINDER_DAYS дней до окончания */
export function isRenewalReminderDue(subscription: Subscription): boolean {
  if (!subscription.hasSuccessfulPayment || subscription.tier !== 'pro') return false;
  const daysLeft = getDaysUntilSubscriptionEnds(subscription);
  if (daysLeft === null) return false;
  return daysLeft <= SUBSCRIPTION_RENEWAL_REMINDER_DAYS;
}

export { SUBSCRIPTION_RENEWAL_REMINDER_DAYS };

export function isPaidPeriodActive(subscription: Subscription): boolean {
  if (!subscription.subscriptionPeriodEndsAt) {
    return subscription.tier === 'pro';
  }

  const periodEnd = new Date(subscription.subscriptionPeriodEndsAt);
  const now = new Date();
  const graceCutoff = new Date(now);
  graceCutoff.setDate(graceCutoff.getDate() - SUBSCRIPTION_GRACE_DAYS);

  // Оплаченный период ещё не истёк
  if (periodEnd > now) {
    return true;
  }

  // Grace period: период истёк, но не более SUBSCRIPTION_GRACE_DAYS назад
  if (periodEnd > graceCutoff) {
    return subscription.hasSuccessfulPayment === true;
  }

  return false;
}

/** Подписка в grace period (период истёк, но доступ ещё есть) */
export function isInGracePeriod(subscription: Subscription): boolean {
  if (!subscription.subscriptionPeriodEndsAt || !subscription.hasSuccessfulPayment) {
    return false;
  }
  const periodEnd = new Date(subscription.subscriptionPeriodEndsAt);
  const now = new Date();
  if (periodEnd > now) return false;

  const graceCutoff = new Date(now);
  graceCutoff.setDate(graceCutoff.getDate() - SUBSCRIPTION_GRACE_DAYS);
  return periodEnd > graceCutoff;
}

export function isTrialActive(subscription: Subscription): boolean {
  if (!subscription.trialEndsAt || subscription.status !== 'active') return false;
  return new Date(subscription.trialEndsAt) > new Date();
}

export function isEarlyAdopterActive(subscription: Subscription): boolean {
  if (!subscription.isEarlyAdopter || !subscription.earlyAdopterEndsAt) return false;
  return new Date(subscription.earlyAdopterEndsAt) > new Date();
}

/** Pro/Enterprise или активный 14-дневный триал на free */
export function hasProAccess(subscription: Subscription): boolean {
  const statusOk =
    subscription.status === 'active' ||
    (subscription.status === 'canceled' && subscription.tier === 'pro');
  if (!statusOk) return false;
  if (subscription.tier === 'enterprise') return true;
  if (subscription.tier === 'pro') {
    if (subscription.subscriptionPeriodEndsAt) {
      return isPaidPeriodActive(subscription);
    }
    return true;
  }
  if (subscription.tier === 'free' && isTrialActive(subscription)) return true;
  return false;
}

export function getEffectiveTier(subscription: Subscription): SubscriptionTier {
  if (hasProAccess(subscription) && subscription.tier === 'free') return 'pro';
  return subscription.tier;
}

export function getProPriceRub(subscription: Subscription | null): number {
  if (subscription && isEarlyAdopterActive(subscription)) {
    return EARLY_ADOPTER_PRICE_RUB;
  }
  return PLAN_PRICING.pro.amountRub;
}

class SubscriptionService {
  async fetchSubscription(userId: string): Promise<Subscription> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'subscription_tier, subscription_status, trial_ends_at, subscription_period_ends_at, is_early_adopter, early_adopter_ends_at, pvz_limit, employee_limit, subscription_autopay_enabled'
        )
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.warn('subscriptionService: Не удалось загрузить подписку:', error?.message);
        return { ...DEFAULT_FREE_SUBSCRIPTION };
      }

      const { count: paymentCount } = await supabase
        .from('subscription_payments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'succeeded');

      const subscription: Subscription = {
        tier: (data.subscription_tier as SubscriptionTier) || 'free',
        status: (data.subscription_status as SubscriptionStatus) || 'active',
        trialEndsAt: data.trial_ends_at,
        subscriptionPeriodEndsAt: data.subscription_period_ends_at,
        hasSuccessfulPayment: (paymentCount ?? 0) > 0,
        subscriptionAutopayEnabled: Boolean(data.subscription_autopay_enabled),
        isEarlyAdopter: Boolean(data.is_early_adopter),
        earlyAdopterEndsAt: data.early_adopter_ends_at,
        pvzLimit: data.pvz_limit ?? FREE_PVZ_LIMIT,
        employeeLimit: data.employee_limit ?? FREE_EMPLOYEE_LIMIT,
      };

      await this.cacheSubscription(subscription);
      return subscription;
    } catch (err) {
      console.error('subscriptionService: Ошибка загрузки подписки:', err);
      const cached = await this.getCachedSubscription();
      return cached || { ...DEFAULT_FREE_SUBSCRIPTION };
    }
  }

  async cacheSubscription(subscription: Subscription): Promise<void> {
    try {
      await SecureStore.setItemAsync(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscription));
    } catch (err) {
      console.error('subscriptionService: Ошибка кеширования подписки:', err);
    }
  }

  async getCachedSubscription(): Promise<Subscription | null> {
    try {
      const stored = await SecureStore.getItemAsync(SUBSCRIPTION_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as Subscription;
      return {
        ...DEFAULT_FREE_SUBSCRIPTION,
        ...parsed,
        isEarlyAdopter: Boolean(parsed.isEarlyAdopter),
      };
    } catch {
      return null;
    }
  }

  async clearCache(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SUBSCRIPTION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  /** Активная платная подписка или триал Pro */
  isActive(subscription: Subscription): boolean {
    return hasProAccess(subscription);
  }

  hasTier(subscription: Subscription, requiredTier: SubscriptionTier): boolean {
    const order: SubscriptionTier[] = ['free', 'pro', 'enterprise'];
    const effectiveTier = getEffectiveTier(subscription);
    const userIdx = order.indexOf(effectiveTier);
    const requiredIdx = order.indexOf(requiredTier);
    if (!hasProAccess(subscription) && subscription.status !== 'active') return false;
    return userIdx >= requiredIdx && (subscription.status === 'active' || subscription.status === 'canceled');
  }

  canAddEmployee(subscription: Subscription, currentEmployeeCount: number): boolean {
    if (hasProAccess(subscription)) return true;
    return currentEmployeeCount < subscription.employeeLimit;
  }

  canAddPvz(subscription: Subscription, currentPvzCount: number): boolean {
    if (hasProAccess(subscription)) return true;
    return currentPvzCount < subscription.pvzLimit;
  }
}

export default new SubscriptionService();
