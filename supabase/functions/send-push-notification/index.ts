import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface PushRequestBody {
  recipientUserId?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

interface ExpoPushReceipt {
  status: string;
  message?: string;
  details?: { error?: string };
}

const INVALID_TOKEN_ERRORS = ['DeviceNotRegistered', 'InvalidCredentials'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase env not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: PushRequestBody;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { recipientUserId, title, body, data } = payload;
  if (!recipientUserId || !title || !body) {
    return new Response(JSON.stringify({ error: 'recipientUserId, title and body are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: tokenRow, error: tokenError } = await adminClient
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', recipientUserId)
    .maybeSingle();

  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = tokenRow?.expo_push_token;
  if (!token || !token.startsWith('ExponentPushToken')) {
    return new Response(JSON.stringify({ data: [{ status: 'ok', message: 'No token' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data: data || {},
      sound: 'default',
      priority: 'high',
    }),
  });

  if (!pushResponse.ok) {
    return new Response(JSON.stringify({ error: `Expo Push API ${pushResponse.status}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await pushResponse.json();
  const receipts = (result?.data ?? []) as ExpoPushReceipt[];

  for (const receipt of receipts) {
    if (receipt.status !== 'error') continue;
    const errorCode = receipt.details?.error || receipt.message || '';
    const isInvalid = INVALID_TOKEN_ERRORS.some((code) => errorCode.includes(code));
    if (isInvalid) {
      await adminClient.from('user_push_tokens').delete().eq('user_id', recipientUserId);
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
