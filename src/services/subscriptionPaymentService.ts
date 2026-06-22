// src/services/subscriptionPaymentService.ts
// Оплата подписки Pro через ЮKassa (VPS API)

import { getApiUrl } from '../../config/api';
import { fetchWithRaceTimeout } from '../../lib/fetchWithRaceTimeout';
import { resolveAuthAccessToken } from './SupabaseAuthService';

export interface CreateProPaymentResult {
  confirmationUrl: string;
  paymentId: string;
  amountRub: number;
  pvzCount: number;
  pricePerPvz: number;
}

export class SubscriptionPaymentError extends Error {
  constructor(
    message: string,
    public readonly code?: 'auth_required' | 'reauth_required' | 'unknown'
  ) {
    super(message);
    this.name = 'SubscriptionPaymentError';
  }
}

async function invokePaymentApi<T>(
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const accessToken = await resolveAuthAccessToken();
  if (!accessToken) {
    throw new SubscriptionPaymentError('Требуется авторизация через email', 'reauth_required');
  }

  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}${path}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body ?? {}),
    },
    30_000
  );

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }

  if (!response.ok) {
    const message =
      (typeof payload.error === 'string' && payload.error) ||
      (response.status === 501
        ? 'Оплата подписки пока не настроена на сервере'
        : `HTTP ${response.status}`);
    throw new SubscriptionPaymentError(message);
  }

  return payload as T;
}

export async function createProPayment(
  returnUrl?: string,
  paymentKind?: 'initial' | 'renewal',
  billingPeriod?: 'month' | 'year'
): Promise<CreateProPaymentResult> {
  const payload = await invokePaymentApi<CreateProPaymentResult & { error?: string }>(
    '/api/subscription/create-payment',
    {
      ...(returnUrl ? { returnUrl } : {}),
      ...(paymentKind ? { paymentKind } : {}),
      ...(billingPeriod ? { billingPeriod } : {}),
    }
  );

  if (payload?.error) {
    throw new SubscriptionPaymentError(payload.error);
  }

  if (!payload?.confirmationUrl) {
    throw new SubscriptionPaymentError('Платёжная ссылка не получена');
  }

  return {
    confirmationUrl: payload.confirmationUrl,
    paymentId: payload.paymentId,
    amountRub: payload.amountRub,
    pvzCount: payload.pvzCount,
    pricePerPvz: payload.pricePerPvz,
  };
}

export interface CancelSubscriptionResult {
  canceled: boolean;
  alreadyCanceled?: boolean;
  subscriptionPeriodEndsAt: string | null;
}

export async function syncProPayment(paymentId?: string): Promise<{ activated: boolean }> {
  const payload = await invokePaymentApi<{ activated?: boolean; error?: string }>(
    '/api/subscription/sync-payment',
    paymentId ? { paymentId } : {}
  );

  if (payload?.error) {
    throw new SubscriptionPaymentError(payload.error);
  }

  return { activated: Boolean(payload.activated) };
}

export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  const payload = await invokePaymentApi<
    CancelSubscriptionResult & { error?: string; ok?: boolean }
  >('/api/subscription/cancel');

  if (payload?.error) {
    throw new SubscriptionPaymentError(payload.error);
  }

  return {
    canceled: Boolean(payload.canceled),
    alreadyCanceled: Boolean(payload.alreadyCanceled),
    subscriptionPeriodEndsAt: payload.subscriptionPeriodEndsAt ?? null,
  };
}
