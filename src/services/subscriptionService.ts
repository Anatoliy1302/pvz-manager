// src/services/subscriptionService.ts
// Сервис для работы с подпиской: получение статуса, лимитов, кеширование

import * as SecureStore from 'expo-secure-store';
import {
  EARLY_ADOPTER_PRICE_RUB,
  ENTERPRISE_EMPLOYEE_LIMIT,
  ENTERPRISE_PVZ_LIMIT,
  FREE_EMPLOYEE_LIMIT,
  FREE_PVZ_LIMIT,
  getProAmountRub,
  PLAN_PRICING,
  PRO_EMPLOYEE_LIMIT,
  PRO_PVZ_LIMIT,
  SUBSCRIPTION_GRACE_DAYS,
  TRIAL_DAYS,
  type BillingPeriod,
} from '../constants/subscription';
import { SUBSCRIPTION_RENEWAL_REMINDER_DAYS } from '../constants/subscriptionProduct';
import { getToken } from '../../lib/authSessionStore';
import { readSnapshotMap, writeSnapshotMap } from '../../lib/snapshotSync';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';
export type SubscriptionLimitType = 'pvz' | 'employee';

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

export interface SubscriptionStatusInfo {
  tier: SubscriptionTier;
  effectiveTier: SubscriptionTier;
  isPro: boolean;
  isTrial: boolean;
  pvzLimit: number;
  employeeLimit: number;
  periodEndsAt: string | null;
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
}

export const SUBSCRIPTION_STORAGE_KEY = 'subscription';

export {
  FREE_EMPLOYEE_LIMIT,
  FREE_PVZ_LIMIT,
  PRO_EMPLOYEE_LIMIT,
  PRO_PVZ_LIMIT,
  ENTERPRISE_EMPLOYEE_LIMIT,
  ENTERPRISE_PVZ_LIMIT,
  EARLY_ADOPTER_PRICE_RUB,
  TRIAL_DAYS,
  SUBSCRIPTION_GRACE_DAYS,
  PLAN_PRICING,
  getProAmountRub,
};

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

  if (periodEnd > now) {
    return true;
  }

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

export function getProPriceRub(
  subscription: Subscription | null,
  period: BillingPeriod = 'month'
): number {
  return getProAmountRub(period, Boolean(subscription && isEarlyAdopterActive(subscription)));
}

class SubscriptionService {
  async fetchSubscription(userId: string): Promise<Subscription> {
    try {
      if (await getToken()) {
        const map = await readSnapshotMap<Subscription>('subscriptions');
        const remote = map[userId];
        if (remote) {
          const subscription: Subscription = {
            ...DEFAULT_FREE_SUBSCRIPTION,
            ...remote,
            isEarlyAdopter: Boolean(remote.isEarlyAdopter),
          };
          await this.cacheSubscription(subscription);
          return subscription;
        }
      }

      const cached = await this.getCachedSubscription();
      if (cached) return cached;

      return { ...DEFAULT_FREE_SUBSCRIPTION };
    } catch (err) {
      console.error('subscriptionService: Ошибка загрузки подписки:', err);
      const cached = await this.getCachedSubscription();
      return cached || { ...DEFAULT_FREE_SUBSCRIPTION };
    }
  }

  async saveSubscription(userId: string, subscription: Subscription): Promise<void> {
    await this.cacheSubscription(subscription);
    if (!(await getToken())) return;
    try {
      const map = await readSnapshotMap<Subscription>('subscriptions');
      map[userId] = subscription;
      await writeSnapshotMap('subscriptions', map);
    } catch (error) {
      if (__DEV__) {
        console.warn('subscriptionService.saveSubscription:', error);
      }
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

  getStatus(subscription: Subscription): SubscriptionStatusInfo {
    const pro = hasProAccess(subscription);
    return {
      tier: subscription.tier,
      effectiveTier: getEffectiveTier(subscription),
      isPro: pro,
      isTrial: isTrialActive(subscription),
      pvzLimit: pro ? PRO_PVZ_LIMIT : subscription.pvzLimit,
      employeeLimit: pro ? PRO_EMPLOYEE_LIMIT : subscription.employeeLimit,
      periodEndsAt: subscription.subscriptionPeriodEndsAt,
    };
  }

  checkLimit(
    subscription: Subscription,
    type: SubscriptionLimitType,
    currentCount: number
  ): LimitCheckResult {
    const pro = hasProAccess(subscription);
    const limit =
      type === 'pvz'
        ? pro
          ? PRO_PVZ_LIMIT
          : subscription.pvzLimit
        : pro
          ? PRO_EMPLOYEE_LIMIT
          : subscription.employeeLimit;

    const allowed =
      type === 'pvz'
        ? this.canAddPvz(subscription, currentCount)
        : this.canAddEmployee(subscription, currentCount);

    return { allowed, limit, current: currentCount };
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
