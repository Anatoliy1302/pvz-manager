import { fetchYooKassaPayment, isYooKassaTestMode } from '../_shared/yookassa.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

interface YooKassaNotification {
  type?: string;
  event?: string;
  object?: {
    id?: string;
    status?: string;
    paid?: boolean;
    test?: boolean;
    metadata?: Record<string, string>;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function ensurePaymentRecord(
  admin: ReturnType<typeof createSupabaseAdmin>,
  payment: Awaited<ReturnType<typeof fetchYooKassaPayment>>
): Promise<void> {
  const { data: existing } = await admin
    .from('subscription_payments')
    .select('id')
    .eq('provider', 'yookassa')
    .eq('provider_payment_id', payment.id)
    .maybeSingle();

  if (existing) return;

  const userId = payment.metadata?.user_id;
  if (!userId) {
    throw new Error(`Payment ${payment.id} missing user_id in metadata`);
  }

  const amountRub = Math.round(Number.parseFloat(payment.amount.value));
  const paymentKind = payment.metadata?.payment_kind ?? 'autopay';

  const { error } = await admin.from('subscription_payments').insert({
    user_id: userId,
    provider: 'yookassa',
    provider_payment_id: payment.id,
    amount_rub: amountRub,
    currency: payment.amount.currency,
    status: 'pending',
    tier: 'pro',
    pvz_count: Number.parseInt(payment.metadata?.pvz_count ?? '1', 10) || 1,
    payment_kind: paymentKind,
    metadata: payment.metadata ?? {},
  });

  if (error) {
    throw new Error(`Failed to register payment ${payment.id}: ${error.message}`);
  }
}

async function savePaymentMethodIfPresent(
  admin: ReturnType<typeof createSupabaseAdmin>,
  payment: Awaited<ReturnType<typeof fetchYooKassaPayment>>
): Promise<void> {
  const userId = payment.metadata?.user_id;
  const methodId = payment.payment_method?.id;
  const saved = payment.payment_method?.saved;

  if (!userId || !methodId || !saved) return;

  const { error } = await admin
    .from('profiles')
    .update({
      yookassa_payment_method_id: methodId,
      subscription_autopay_enabled: true,
    })
    .eq('id', userId)
    .eq('role', 'owner');

  if (error) {
    console.error(`payment-webhook: failed to save payment method for ${userId}:`, error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const notification = (await req.json()) as YooKassaNotification;
    const paymentId = notification.object?.id;

    if (!paymentId) {
      return jsonResponse({ error: 'Missing payment id' }, 400);
    }

    const event = notification.event ?? '';
    if (event !== 'payment.succeeded' && event !== 'payment.waiting_for_capture') {
      return jsonResponse({ ok: true, ignored: true, event });
    }

    const payment = await fetchYooKassaPayment(paymentId);

    if (payment.status !== 'succeeded' || !payment.paid) {
      return jsonResponse({ ok: true, status: payment.status, paid: payment.paid });
    }

    const isTestPayment = Boolean(payment.test);
    const serverTestMode = isYooKassaTestMode();

    if (isTestPayment && !serverTestMode) {
      console.log(
        `payment-webhook: ignoring test payment ${payment.id} (YOOKASSA_TEST_MODE is off)`
      );
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'test_payment_in_production',
        paymentId: payment.id,
      });
    }

    const admin = createSupabaseAdmin();

    await ensurePaymentRecord(admin, payment);

    const { data: activated, error: activateError } = await admin.rpc(
      'activate_pro_subscription_from_payment',
      {
        p_provider_payment_id: payment.id,
        p_provider: 'yookassa',
      }
    );

    if (activateError) {
      throw new Error(`Failed to activate subscription: ${activateError.message}`);
    }

    await savePaymentMethodIfPresent(admin, payment);

    const paymentKind = payment.metadata?.payment_kind ?? 'unknown';
    console.log(
      `payment-webhook: ${paymentKind} payment ${payment.id} processed, activated=${Boolean(activated)}`
    );

    return jsonResponse({
      ok: true,
      activated: Boolean(activated),
      paymentId: payment.id,
      paymentKind,
      test: isTestPayment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('payment-webhook error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
