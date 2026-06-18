import type { Subscription } from '../services/subscriptionService';

/** Subscription state handling — tier and billing status for paywall UI. */
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'inactive';

export function getSubscriptionStatus(subscription: Subscription | null | undefined): SubscriptionStatus {
  const status = subscription?.status ?? 'active';
  if (status === 'canceled') return 'canceled';
  if (status === 'past_due') return 'past_due';
  if (status === 'trialing') return 'trialing';
  if (status === 'inactive') return 'inactive';
  return 'active';
}

export function isSubscriptionStatusActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

export function shouldShowSubscriptionRenewal(status: SubscriptionStatus, tier: string): boolean {
  return tier === 'pro' && (status === 'active' || status === 'past_due');
}
