import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import { deleteAuthUserData } from '../_shared/account-deletion.ts';
import { verifyOwnerPin } from '../_shared/owner-pin-verify.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
    const body = (await req.json()) as {
      email?: string;
      userId?: string;
      pin?: string;
      pinHash?: string;
    };

    const email = normalizeEmail(body.email ?? '');
    const userId = (body.userId ?? '').trim();
    const pin = String(body.pin ?? '').replace(/\D/g, '');
    const pinHash = (body.pinHash ?? '').trim();

    if (!email || !userId || pin.length < 4) {
      return jsonResponse({ error: 'Invalid request' }, 400);
    }

    const admin = createSupabaseAdmin();

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, email, owner_pin_hash')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404);
    }

    if (profile.role !== 'owner') {
      return jsonResponse({ error: 'Owner only' }, 403);
    }

    const profileEmail = normalizeEmail(profile.email ?? '');
    if (profileEmail !== email) {
      return jsonResponse({ error: 'Email mismatch' }, 403);
    }

    const storedHash = (profile.owner_pin_hash as string | null) || pinHash;
    if (!storedHash) {
      return jsonResponse({ error: 'PIN not configured' }, 400);
    }

    const pinValid = await verifyOwnerPin(pin, storedHash);
    if (!pinValid) {
      return jsonResponse({ error: 'Invalid PIN' }, 401);
    }

    if (!profile.owner_pin_hash && pinHash && pinValid) {
      await admin.from('profiles').update({ owner_pin_hash: pinHash }).eq('id', userId);
    }

    await deleteAuthUserData(admin, userId, profile.role);

    return jsonResponse({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('delete-owner-by-pin error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
