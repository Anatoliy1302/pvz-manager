import { createSupabaseAdmin, createSupabaseUserClient } from '../_shared/supabase-admin.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * ЮKassa не предоставляет API для удаления сохранённого способа оплаты.
 * Отключение автопродления — удаление payment_method_id и флага autopay в БД.
 * @see https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/basics
 */
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
        'id, role, subscription_tier, subscription_status, subscription_period_ends_at, subscription_autopay_enabled, yookassa_payment_method_id'
      )
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404);
    }

    if (profile.role !== 'owner') {
      return jsonResponse({ error: 'Only owners can cancel subscription' }, 403);
    }

    if (profile.subscription_tier !== 'pro') {
      return jsonResponse({ error: 'No active Pro subscription to cancel' }, 400);
    }

    if (profile.subscription_status === 'canceled') {
      return jsonResponse({
        ok: true,
        alreadyCanceled: true,
        subscriptionPeriodEndsAt: profile.subscription_period_ends_at,
      });
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({
        subscription_status: 'canceled',
        subscription_autopay_enabled: false,
        yookassa_payment_method_id: null,
      })
      .eq('id', user.id)
      .eq('role', 'owner');

    if (updateError) {
      throw new Error(`Failed to cancel subscription: ${updateError.message}`);
    }

    return jsonResponse({
      ok: true,
      canceled: true,
      autopayDisabled: true,
      subscriptionPeriodEndsAt: profile.subscription_period_ends_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('cancel-subscription error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
