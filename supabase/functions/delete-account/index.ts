import { createSupabaseAdmin, createSupabaseUserClient } from '../_shared/supabase-admin.ts';
import { deleteAuthUserData } from '../_shared/account-deletion.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
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

    await deleteAuthUserData(admin, user.id, profile.role);

    return jsonResponse({ ok: true, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('delete-account error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
