import { createSupabaseAdmin } from '../_shared/supabase-admin.ts';
import {
  authenticateEnterpriseRequest,
  logApiRequest,
  type EnterpriseAuthContext,
} from '../_shared/enterprise-api-auth.ts';
import {
  fetchPvzList,
  fetchSalary,
  fetchShifts,
  parseDateRange,
  parseShiftStatusFilter,
} from '../_shared/enterprise-api-data.ts';
import {
  buildExportPayload,
  serializeExport,
  uploadExportFile,
  type ExportFormat,
} from '../_shared/enterprise-api-export.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-api-key',
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function resolveRoute(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const fnIndex = segments.indexOf('enterprise-api');
  if (fnIndex >= 0 && segments.length > fnIndex + 1) {
    return segments.slice(fnIndex + 1).join('/');
  }
  const last = segments[segments.length - 1] || '';
  return last;
}

async function withLogging(
  ctx: EnterpriseAuthContext,
  req: Request,
  endpoint: string,
  handler: () => Promise<Response>
): Promise<Response> {
  const started = Date.now();
  try {
    const response = await handler();
    await logApiRequest(ctx, req, endpoint, response.status, Date.now() - started);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logApiRequest(ctx, req, endpoint, 500, Date.now() - started, message);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const route = resolveRoute(url.pathname);

  const auth = await authenticateEnterpriseRequest(req);
  if (!auth.ok) {
    return jsonResponse({ error: auth.message }, auth.status);
  }

  const ctx = auth.ctx;
  const admin = createSupabaseAdmin();

  try {
    // GET /shifts
    if (route === 'shifts' && req.method === 'GET') {
      return await withLogging(ctx, req, 'shifts', async () => {
        const range = parseDateRange(url);
        if ('error' in range) {
          return jsonResponse({ error: range.error }, 400);
        }

        const pvzId = url.searchParams.get('pvz_id') || undefined;
        const statusParam = parseShiftStatusFilter(url.searchParams.get('status'));
        if ('error' in statusParam) {
          return jsonResponse({ error: statusParam.error }, 400);
        }

        const shifts = await fetchShifts(admin, ctx.ownerId, range, {
          pvzId,
          statusFilter: statusParam,
        });

        return jsonResponse({
          data: shifts,
          meta: {
            from_date: range.fromDate,
            to_date: range.toDate,
            count: shifts.length,
            pvz_id: pvzId ?? null,
            status: statusParam,
          },
        });
      });
    }

    // GET /salary
    if (route === 'salary' && req.method === 'GET') {
      return await withLogging(ctx, req, 'salary', async () => {
        const range = parseDateRange(url);
        if ('error' in range) {
          return jsonResponse({ error: range.error }, 400);
        }

        const employeeId = url.searchParams.get('employee_id') || undefined;
        const pvzId = url.searchParams.get('pvz_id') || undefined;
        const rows = await fetchSalary(admin, ctx.ownerId, range, { employeeId, pvzId });

        return jsonResponse({
          data: rows,
          meta: {
            from_date: range.fromDate,
            to_date: range.toDate,
            count: rows.length,
            employee_id: employeeId ?? null,
            pvz_id: pvzId ?? null,
          },
        });
      });
    }

    // GET /pvz
    if (route === 'pvz' && req.method === 'GET') {
      return await withLogging(ctx, req, 'pvz', async () => {
        const pvzList = await fetchPvzList(admin, ctx.ownerId);
        return jsonResponse({
          data: pvzList,
          meta: { count: pvzList.length },
        });
      });
    }

    // POST /export
    if (route === 'export' && req.method === 'POST') {
      return await withLogging(ctx, req, 'export', async () => {
        const body = (await req.json().catch(() => ({}))) as {
          from_date?: string;
          to_date?: string;
          format?: string;
          pvz_id?: string;
          inline?: boolean;
        };

        const fromDate = body.from_date;
        const toDate = body.to_date;

        if (!fromDate || !toDate) {
          return jsonResponse({ error: 'from_date and to_date are required' }, 400);
        }

        const format = (body.format || 'xml').toLowerCase() as ExportFormat;
        if (!['xml', 'json', 'csv'].includes(format)) {
          return jsonResponse({ error: 'format must be xml, json, or csv' }, 400);
        }

        const range = parseDateRange(
          new URL(`https://x?from_date=${fromDate}&to_date=${toDate}`)
        );
        if ('error' in range) {
          return jsonResponse({ error: range.error }, 400);
        }

        const payload = await buildExportPayload(admin, ctx.ownerId, range, body.pvz_id);
        payload.meta.format = format;

        const serialized = serializeExport(payload, format);

        if (body.inline === true) {
          return new Response(serialized.content, {
            status: 200,
            headers: {
              'Content-Type': serialized.mimeType,
              'Content-Disposition': `attachment; filename="payroll_${range.fromDate}_${range.toDate}.${serialized.extension}"`,
              ...CORS_HEADERS,
            },
          });
        }

        const uploaded = await uploadExportFile(
          admin,
          ctx.ownerId,
          serialized.content,
          serialized.extension,
          serialized.mimeType
        );

        return jsonResponse({
          download_url: uploaded.downloadUrl,
          expires_at: uploaded.expiresAt,
          format,
          period: { from_date: range.fromDate, to_date: range.toDate },
          path: uploaded.path,
        });
      });
    }

    // POST /keys — создание API-ключа (только JWT, не API key)
    if (route === 'keys' && req.method === 'POST') {
      if (ctx.authMethod !== 'jwt') {
        return jsonResponse({ error: 'API key creation requires JWT authentication' }, 403);
      }

      return await withLogging(ctx, req, 'keys/create', async () => {
        const body = (await req.json().catch(() => ({}))) as { name?: string };
        const name = (body.name || 'Default').trim() || 'Default';

        const plainKey =
          'pvz_ent_' +
          crypto.randomUUID().replace(/-/g, '') +
          crypto.randomUUID().replace(/-/g, '');
        const keyPrefix = plainKey.slice(0, 16);

        const keyData = new TextEncoder().encode(plainKey);
        const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
        const keyHash = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        const { data: inserted, error } = await admin
          .from('api_keys')
          .insert({
            owner_id: ctx.ownerId,
            name,
            key_prefix: keyPrefix,
            key_hash: keyHash,
          })
          .select('id, name, key_prefix, created_at')
          .single();

        if (error) {
          return jsonResponse({ error: error.message }, 400);
        }

        return jsonResponse(
          {
            id: inserted.id,
            name: inserted.name,
            key_prefix: inserted.key_prefix,
            api_key: plainKey,
            created_at: inserted.created_at,
            warning: 'Сохраните api_key сейчас — он больше не будет показан.',
          },
          201
        );
      });
    }

    // GET /keys — список ключей (prefix only)
    if (route === 'keys' && req.method === 'GET') {
      if (ctx.authMethod !== 'jwt') {
        return jsonResponse({ error: 'Listing API keys requires JWT authentication' }, 403);
      }

      return await withLogging(ctx, req, 'keys/list', async () => {
        const { data, error } = await admin
          .from('api_keys')
          .select('id, name, key_prefix, is_active, last_used_at, created_at, expires_at')
          .eq('owner_id', ctx.ownerId)
          .order('created_at', { ascending: false });

        if (error) {
          return jsonResponse({ error: error.message }, 500);
        }

        return jsonResponse({ data: data || [] });
      });
    }

    // DELETE /keys/:id
    if (route.startsWith('keys/') && req.method === 'DELETE') {
      if (ctx.authMethod !== 'jwt') {
        return jsonResponse({ error: 'Revoking API keys requires JWT authentication' }, 403);
      }

      const keyId = route.slice('keys/'.length);
      return await withLogging(ctx, req, 'keys/revoke', async () => {
        const { data, error } = await admin
          .from('api_keys')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', keyId)
          .eq('owner_id', ctx.ownerId)
          .eq('is_active', true)
          .select('id')
          .maybeSingle();

        if (error) {
          return jsonResponse({ error: error.message }, 400);
        }

        if (!data) {
          return jsonResponse({ error: 'API key not found' }, 404);
        }

        return jsonResponse({ revoked: true, id: keyId });
      });
    }

    return jsonResponse({ error: 'Not found', route }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('enterprise-api error:', message);
    return jsonResponse({ error: message }, 500);
  }
});
