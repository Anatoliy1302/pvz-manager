import {
  buildSubscriptionMetadata,
  createYooKassaAutopayment,
  isYooKassaAutopayEnabled,
  isYooKassaTestMode,
  PRO_SUBSCRIPTION_PERIOD_DAYS,
  PRO_SUBSCRIPTION_PRODUCT_NAME,
} from '../_shared/yookassa.ts';
import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';

interface DueProfile {
  user_id: string;
  yookassa_payment_method_id: string;
  subscription_period_ends_at: string;
  amount_rub: number;
  pvz_count: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isAuthorizedCron(req: Request): boolean {
  const secret = Deno.env.get('SUBSCRIPTION_CRON_SECRET');
  if (!secret) return false;
  const header = req.headers.get('Authorization') ?? '';
  return header === `Bearer ${secret}` || header === secret;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!isAuthorizedCron(req)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!isYooKassaAutopayEnabled()) {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: 'YOOKASSA_AUTOPAY_ENABLED is off — use manual renewal reminders',
    });
  }

  try {
    const admin = createSupabaseAdmin();
    const { data: dueProfiles, error: queryError } = await admin.rpc('get_profiles_due_for_autopay');

    if (queryError) {
      throw new Error(`Failed to load profiles: ${queryError.message}`);
    }

    const profiles = (dueProfiles ?? []) as DueProfile[];
    const results: Array<{ userId: string; paymentId?: string; error?: string }> = [];

    for (const profile of profiles) {
      try {
        const pricePerPvz = Math.round(profile.amount_rub / profile.pvz_count);
        const description = `Автопродление ${PRO_SUBSCRIPTION_PRODUCT_NAME}, ${PRO_SUBSCRIPTION_PERIOD_DAYS} дн. (${profile.pvz_count} ПВЗ)`;
        const idempotenceKey = crypto.randomUUID();

        const payment = await createYooKassaAutopayment({
          amountRub: profile.amount_rub,
          description,
          paymentMethodId: profile.yookassa_payment_method_id,
          metadata: buildSubscriptionMetadata(
            profile.user_id,
            profile.pvz_count,
            pricePerPvz,
            'autopay'
          ),
          idempotenceKey,
        });

        const { error: insertError } = await admin.from('subscription_payments').insert({
          user_id: profile.user_id,
          provider: 'yookassa',
          provider_payment_id: payment.id,
          amount_rub: profile.amount_rub,
          currency: 'RUB',
          status: 'pending',
          tier: 'pro',
          pvz_count: profile.pvz_count,
          payment_kind: 'autopay',
          metadata: { period_days: PRO_SUBSCRIPTION_PERIOD_DAYS, recurring: true },
        });

        if (insertError && !insertError.message.includes('duplicate')) {
          throw new Error(insertError.message);
        }

        if (payment.status === 'succeeded' && payment.paid) {
          await admin.rpc('activate_pro_subscription_from_payment', {
            p_provider_payment_id: payment.id,
            p_provider: 'yookassa',
          });
        }

        results.push({ userId: profile.user_id, paymentId: payment.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`process-subscription-renewals: user ${profile.user_id}:`, message);
        results.push({ userId: profile.user_id, error: message });
      }
    }

    return jsonResponse({
      ok: true,
      processed: profiles.length,
      testMode: isYooKassaTestMode(),
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('process-subscription-renewals error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
