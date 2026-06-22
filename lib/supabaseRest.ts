/** @deprecated Supabase REST заменён — заглушки для совместимости. */
export const REST_PAGE_SIZE = 500;

export function getSupabaseRestConfig(): { baseUrl: string; apiKey: string } {
  return { baseUrl: '', apiKey: '' };
}

export async function supabaseRestGet<T>(_table: string, _query: string, _accessToken: string, _timeoutMs?: number): Promise<T[] | null> {
  return null;
}

export async function supabaseRestGetAll<T>(_table: string, _queryBase: string, _accessToken: string, _pageSize?: number, _timeoutMs?: number): Promise<T[] | null> {
  return null;
}

export async function supabaseRestUpsert<T>(_table: string, _rows: Record<string, unknown> | Record<string, unknown>[], _accessToken: string, _onConflict?: string, _timeoutMs?: number): Promise<T | null> {
  return null;
}

export async function supabaseRestInsert<T>(_table: string, _rows: Record<string, unknown>[], _accessToken: string, _timeoutMs?: number): Promise<T[] | null> {
  return null;
}

export async function supabaseRestPatch<T>(_table: string, _query: string, _body: Record<string, unknown>, _accessToken: string, _timeoutMs?: number): Promise<T | null> {
  return null;
}

export async function supabaseRestDelete(_table: string, _query: string, _accessToken: string, _timeoutMs?: number): Promise<boolean> {
  return false;
}

export async function supabaseRestRpc<T>(_fn: string, _args: Record<string, unknown>, _accessToken: string, _timeoutMs?: number): Promise<T | null> {
  return null;
}

export async function supabaseRestRpcVoid(_fn: string, _args: Record<string, unknown>, _accessToken: string, _timeoutMs?: number): Promise<boolean> {
  return false;
}

export async function supabaseRestRpcAnon<T>(_fn: string, _args: Record<string, unknown>, _timeoutMs?: number): Promise<T | null> {
  return null;
}
