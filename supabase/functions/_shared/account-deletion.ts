import type { SupabaseClient } from '@supabase/supabase-js';

export async function cleanupPvzReferences(
  admin: SupabaseClient,
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

export async function cancelOwnerSubscription(
  admin: SupabaseClient,
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

export async function deleteAuthUserData(
  admin: SupabaseClient,
  userId: string,
  role: string
): Promise<void> {
  if (role === 'owner') {
    await cancelOwnerSubscription(admin, userId);

    const { data: ownedPvzs } = await admin.from('pvz').select('id').eq('owner_id', userId);
    const pvzIds = (ownedPvzs ?? []).map((row) => row.id as string);

    if (pvzIds.length > 0) {
      await cleanupPvzReferences(admin, pvzIds);
      const { error: pvzDeleteError } = await admin.from('pvz').delete().eq('owner_id', userId);
      if (pvzDeleteError) {
        throw new Error(`Failed to delete PVZ: ${pvzDeleteError.message}`);
      }
    }
  }

  await admin.from('user_push_tokens').delete().eq('user_id', userId);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    throw new Error(`Failed to delete user: ${deleteError.message}`);
  }
}
