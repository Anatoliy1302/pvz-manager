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

async function cleanupPvzReferences(
  admin: ReturnType<typeof createSupabaseAdmin>,
  pvzIds: string[]
): Promise<void> {
  for (const pvzId of pvzIds) {
    const { data: byArray } = await admin
      .from('profiles')
      .select('id, pvz_id, pvz_ids')
      .contains('pvz_ids', [pvzId]);

    const { data: byFk } = await admin
      .from('profiles')
      .select('id, pvz_id, pvz_ids')
      .eq('pvz_id', pvzId);

    const merged = new Map<string, { id: string; pvz_id: string | null; pvz_ids: string[] | null }>();
    for (const profile of [...(byArray ?? []), ...(byFk ?? [])]) {
      merged.set(profile.id, profile);
    }

    for (const profile of merged.values()) {
      const ids = profile.pvz_ids ?? [];
      const newIds = ids.filter((id) => id !== pvzId);
      const updates: { pvz_ids: string[]; pvz_id?: string | null } = { pvz_ids: newIds };
      if (profile.pvz_id === pvzId) {
        updates.pvz_id = newIds[0] ?? null;
      }
      await admin.from('profiles').update(updates).eq('id', profile.id);
    }
  }
}

async function cancelOwnerSubscription(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<void> {
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status')
    .eq('id', userId)
    .single();

  if (profile?.subscription_tier === 'pro' && profile.subscription_status !== 'canceled') {
    await admin
      .from('profiles')
      .update({
        subscription_status: 'canceled',
        subscription_autopay_enabled: false,
        yookassa_payment_method_id: null,
      })
      .eq('id', userId)
      .eq('role', 'owner');
  }
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
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404);
    }

    if (profile.role === 'owner') {
      await cancelOwnerSubscription(admin, user.id);

      const { data: ownedPvzs } = await admin.from('pvz').select('id').eq('owner_id', user.id);
      const pvzIds = (ownedPvzs ?? []).map((row) => row.id as string);

      if (pvzIds.length > 0) {
        await cleanupPvzReferences(admin, pvzIds);
        const { error: pvzDeleteError } = await admin.from('pvz').delete().eq('owner_id', user.id);
        if (pvzDeleteError) {
          throw new Error(`Failed to delete PVZ: ${pvzDeleteError.message}`);
        }
      }
    }

    await admin.from('user_push_tokens').delete().eq('user_id', user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      throw new Error(`Failed to delete user: ${deleteError.message}`);
    }

    return jsonResponse({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('delete-account error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
