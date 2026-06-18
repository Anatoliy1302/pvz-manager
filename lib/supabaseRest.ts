import { requireExpoPublicEnv } from './expoPublicEnv';

const DEFAULT_REST_TIMEOUT_MS = 10_000;
export const REST_PAGE_SIZE = 500;

export function getSupabaseRestConfig(): { baseUrl: string; apiKey: string } {
  return {
    baseUrl: requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_URL').replace(/\/+$/, ''),
    apiKey: requireExpoPublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  };
}

/** GET /rest/v1/{table} — без ожидания supabase.auth.setSession. */
export async function supabaseRestGet<T>(
  table: string,
  query: string,
  accessToken: string,
  timeoutMs = DEFAULT_REST_TIMEOUT_MS
): Promise<T[] | null> {
  const { baseUrl, apiKey } = getSupabaseRestConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T[];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** GET с пагинацией limit/offset (PostgREST). */
export async function supabaseRestGetAll<T>(
  table: string,
  queryBase: string,
  accessToken: string,
  pageSize = REST_PAGE_SIZE,
  timeoutMs = DEFAULT_REST_TIMEOUT_MS
): Promise<T[] | null> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const separator = queryBase.includes('?') ? '&' : '';
    const query = `${queryBase}${separator}limit=${pageSize}&offset=${offset}`;
    const rows = await supabaseRestGet<T>(table, query, accessToken, timeoutMs);
    if (rows === null) {
      return offset === 0 ? null : all;
    }
    all.push(...rows);
    if (rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return all;
}
