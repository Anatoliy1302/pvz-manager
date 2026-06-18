// src/services/subscriptionPaymentService.ts
// Оплата подписки Pro через ЮKassa (Edge Functions create-payment / cancel-subscription)

import { supabase } from '../../lib/supabase';
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

async function invokeAuthenticatedFunction<T>(
  functionName: string,
  body?: Record<string, unknown>
): Promise<{ data: T | null; error: { message?: string } | null }> {
  const accessToken = await resolveAuthAccessToken();
  if (!accessToken) {
    throw new SubscriptionPaymentError('Требуется авторизация через email', 'reauth_required');
  }

  return supabase.functions.invoke(functionName, {
    ...(body ? { body } : {}),
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function createProPayment(
  returnUrl?: string,
  paymentKind?: 'initial' | 'renewal'
): Promise<CreateProPaymentResult> {
  const { data, error } = await invokeAuthenticatedFunction<
    CreateProPaymentResult & { error?: string }
  >('create-payment', {
    ...(returnUrl ? { returnUrl } : {}),
    ...(paymentKind ? { paymentKind } : {}),
  });

  if (error) {
    throw new SubscriptionPaymentError(error.message || 'Не удалось создать платёж');
  }

  const payload = data as CreateProPaymentResult & { error?: string };

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

export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  const { data, error } = await invokeAuthenticatedFunction<
    CancelSubscriptionResult & { error?: string; ok?: boolean }
  >('cancel-subscription');

  if (error) {
    throw new SubscriptionPaymentError(error.message || 'Не удалось отменить подписку');
  }

  const payload = data as CancelSubscriptionResult & { error?: string; ok?: boolean };

  if (payload?.error) {
    throw new SubscriptionPaymentError(payload.error);
  }

  return {
    canceled: Boolean(payload.canceled),
    alreadyCanceled: Boolean(payload.alreadyCanceled),
    subscriptionPeriodEndsAt: payload.subscriptionPeriodEndsAt ?? null,
  };
}
