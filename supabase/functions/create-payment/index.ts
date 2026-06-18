import {
  buildSubscriptionMetadata,
  createYooKassaPayment,
  isYooKassaTestMode,
  PRO_SUBSCRIPTION_PERIOD_DAYS,
  PRO_SUBSCRIPTION_PRODUCT_NAME,
  type PaymentKind,
} from '../_shared/yookassa.ts';
import { createSupabaseAdmin, createSupabaseUserClient } from '../_shared/supabase-admin.ts';

const PRO_PVZ_LIMIT = 999;
const PRO_EMPLOYEE_LIMIT = 999;
const STANDARD_PRO_PRICE_RUB = 1490;
const EARLY_ADOPTER_PRICE_RUB = 990;

interface CreatePaymentRequest {
  returnUrl?: string;
  paymentKind?: PaymentKind;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function getProPriceRub(profile: {
  is_early_adopter: boolean;
  early_adopter_ends_at: string | null;
}): number {
  if (
    profile.is_early_adopter &&
    profile.early_adopter_ends_at &&
    new Date(profile.early_adopter_ends_at) > new Date()
  ) {
    return EARLY_ADOPTER_PRICE_RUB;
  }
  return STANDARD_PRO_PRICE_RUB;
}

function buildDescription(
  billablePvzCount: number,
  paymentKind: PaymentKind,
  testMode: boolean
): string {
  const prefix = testMode ? '[TEST] ' : '';
  const pvzPart =
    billablePvzCount === 1 ? '1 ПВЗ' : `${billablePvzCount} ПВЗ`;
  const action = paymentKind === 'initial' ? 'Подписка' : 'Продление';
  return `${prefix}${action} ${PRO_SUBSCRIPTION_PRODUCT_NAME}, ${PRO_SUBSCRIPTION_PERIOD_DAYS} дн. (${pvzPart})`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const userClient = createSupabaseUserClient(authHeader);
    const admin = createSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select(
        'id, role, subscription_tier, subscription_status, is_early_adopter, early_adopter_ends_at, subscription_period_ends_at'
      )
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404);
    }

    if (profile.role !== 'owner') {
      return jsonResponse({ error: 'Only owners can purchase Pro subscription' }, 403);
    }

    if (profile.subscription_tier === 'enterprise' && profile.subscription_status === 'active') {
      return jsonResponse({ error: 'Enterprise subscription is already active' }, 400);
    }

    const { count: pvzCount, error: pvzError } = await admin
      .from('pvz')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    if (pvzError) {
      throw new Error(`Failed to count PVZ: ${pvzError.message}`);
    }

    const { count: paidCount } = await admin
      .from('subscription_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'succeeded');

    const billablePvzCount = Math.max(pvzCount ?? 0, 1);
    const pricePerPvz = getProPriceRub(profile);
    const totalRub = pricePerPvz * billablePvzCount;

    const body = (await req.json().catch(() => ({}))) as CreatePaymentRequest;
    const returnUrl =
      body.returnUrl?.trim() ||
      Deno.env.get('YOOKASSA_RETURN_URL') ||
      'pvzpersonal://payment/success';

    const paymentKind: PaymentKind =
      body.paymentKind === 'renewal' || (paidCount ?? 0) > 0 ? 'renewal' : 'initial';

    const idempotenceKey = crypto.randomUUID();
    const testMode = isYooKassaTestMode();
    const description = buildDescription(billablePvzCount, paymentKind, testMode);

    const payment = await createYooKassaPayment({
      amountRub: totalRub,
      description,
      returnUrl,
      test: testMode,
      savePaymentMethod: true,
      metadata: {
        ...buildSubscriptionMetadata(user.id, billablePvzCount, pricePerPvz, paymentKind),
        is_test: testMode ? 'true' : 'false',
      },
      idempotenceKey,
    });

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      throw new Error('YooKassa did not return confirmation_url');
    }

    const { error: insertError } = await admin.from('subscription_payments').insert({
      user_id: user.id,
      provider: 'yookassa',
      provider_payment_id: payment.id,
      amount_rub: totalRub,
      currency: 'RUB',
      status: 'pending',
      tier: 'pro',
      pvz_count: billablePvzCount,
      payment_kind: paymentKind,
      metadata: {
        price_per_pvz: pricePerPvz,
        return_url: returnUrl,
        is_test: testMode,
        period_days: PRO_SUBSCRIPTION_PERIOD_DAYS,
        recurring: true,
      },
    });

    if (insertError) {
      throw new Error(`Failed to store payment: ${insertError.message}`);
    }

    return jsonResponse({
      confirmationUrl,
      paymentId: payment.id,
      amountRub: totalRub,
      pvzCount: billablePvzCount,
      pricePerPvz,
      paymentKind,
      periodDays: PRO_SUBSCRIPTION_PERIOD_DAYS,
      savePaymentMethod: true,
      pvzLimit: PRO_PVZ_LIMIT,
      employeeLimit: PRO_EMPLOYEE_LIMIT,
      testMode,
      isTestPayment: Boolean(payment.test),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('create-payment error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
