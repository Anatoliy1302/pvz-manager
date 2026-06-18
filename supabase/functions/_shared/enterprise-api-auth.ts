import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdmin, createSupabaseUserClient } from './supabase-admin.ts';

export interface EnterpriseAuthContext {
  ownerId: string;
  authMethod: 'jwt' | 'api_key';
  apiKeyId?: string;
  rateLimitPerMinute: number;
}

export interface AuthResult {
  ok: true;
  ctx: EnterpriseAuthContext;
}

export interface AuthError {
  ok: false;
  status: number;
  message: string;
}

const DEFAULT_RATE_LIMIT = Number(Deno.env.get('ENTERPRISE_API_RATE_LIMIT') || '100');

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyEnterpriseOwner(
  admin: SupabaseClient,
  ownerId: string
): Promise<boolean> {
  const { data, error } = await admin.rpc('is_enterprise_owner', { p_user_id: ownerId });
  if (error) {
    console.error('is_enterprise_owner error:', error.message);
    return false;
  }
  return Boolean(data);
}

async function checkRateLimit(
  admin: SupabaseClient,
  ownerId: string,
  limit: number
): Promise<boolean> {
  const { data, error } = await admin.rpc('check_api_rate_limit', {
    p_owner_id: ownerId,
    p_limit: limit,
  });
  if (error) {
    console.error('check_api_rate_limit error:', error.message);
    return true;
  }
  return Boolean(data);
}

export async function authenticateEnterpriseRequest(
  req: Request
): Promise<AuthResult | AuthError> {
  const admin = createSupabaseAdmin();
  const authHeader = req.headers.get('Authorization');
  const apiKeyHeader = req.headers.get('X-API-Key');

  let bearerToken: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }

  // API key via X-API-Key or Bearer pvz_ent_...
  const apiKey = apiKeyHeader?.trim() || (bearerToken?.startsWith('pvz_ent_') ? bearerToken : null);

  if (apiKey) {
    const keyHash = await sha256Hex(apiKey);

    const { data: keyRow, error: keyError } = await admin
      .from('api_keys')
      .select('id, owner_id, is_active, rate_limit_per_minute, expires_at')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (keyError || !keyRow || !keyRow.is_active) {
      return { ok: false, status: 401, message: 'Invalid API key' };
    }

    if (keyRow.expires_at && new Date(keyRow.expires_at) <= new Date()) {
      return { ok: false, status: 401, message: 'API key expired' };
    }

    const isEnterprise = await verifyEnterpriseOwner(admin, keyRow.owner_id);
    if (!isEnterprise) {
      return { ok: false, status: 403, message: 'Enterprise subscription required' };
    }

    const rateLimit = keyRow.rate_limit_per_minute ?? DEFAULT_RATE_LIMIT;
    const allowed = await checkRateLimit(admin, keyRow.owner_id, rateLimit);
    if (!allowed) {
      return { ok: false, status: 429, message: 'Rate limit exceeded. Try again in a minute.' };
    }

    await admin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id);

    return {
      ok: true,
      ctx: {
        ownerId: keyRow.owner_id,
        authMethod: 'api_key',
        apiKeyId: keyRow.id,
        rateLimitPerMinute: rateLimit,
      },
    };
  }

  // JWT auth
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Missing Authorization header or X-API-Key' };
  }

  const userClient = createSupabaseUserClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, message: 'Invalid or expired JWT token' };
  }

  const isEnterprise = await verifyEnterpriseOwner(admin, user.id);
  if (!isEnterprise) {
    return { ok: false, status: 403, message: 'Enterprise subscription required' };
  }

  const allowed = await checkRateLimit(admin, user.id, DEFAULT_RATE_LIMIT);
  if (!allowed) {
    return { ok: false, status: 429, message: 'Rate limit exceeded. Try again in a minute.' };
  }

  return {
    ok: true,
    ctx: {
      ownerId: user.id,
      authMethod: 'jwt',
      rateLimitPerMinute: DEFAULT_RATE_LIMIT,
    },
  };
}

export async function logApiRequest(
  ctx: EnterpriseAuthContext,
  req: Request,
  endpoint: string,
  statusCode: number,
  responseTimeMs: number,
  errorMessage?: string
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();
    const url = new URL(req.url);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });

    await admin.from('api_logs').insert({
      owner_id: ctx.ownerId,
      api_key_id: ctx.apiKeyId ?? null,
      auth_method: ctx.authMethod,
      endpoint,
      method: req.method,
      status_code: statusCode,
      request_ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip'),
      user_agent: req.headers.get('user-agent'),
      query_params: params,
      response_time_ms: responseTimeMs,
      error_message: errorMessage ?? null,
    });
  } catch (err) {
    console.error('logApiRequest error:', err);
  }
}
