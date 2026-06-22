import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';

/** Размер страницы для sync-запросов (PostgREST max ~1000). */
export const SUPABASE_PAGE_SIZE = 500;

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Загружает все строки постранично (.range).
 * buildPage(from, to) — from/to inclusive (PostgREST).
 */
export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => Promise<QueryResult<T>>,
  pageSize = SUPABASE_PAGE_SIZE
): Promise<T[] | null> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    let result = await buildPage(offset, offset + pageSize - 1);
    if (result.error?.message?.toLowerCase().includes('abort')) {
      result = await buildPage(offset, offset + pageSize - 1);
    }
    const { data, error } = result;
    if (error) {
      if (__DEV__) {
        console.warn('[Supabase] fetchAllPages:', error.message);
      }
      return offset === 0 ? null : all;
    }

    const page = data ?? [];
    all.push(...page);
    if (page.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return all;
}

/** Обёртка для цепочки supabase.from().select().order()… */
export async function fetchAllFromQuery<T>(
  buildBaseQuery: () => PostgrestFilterBuilder<any, any, any, T[], string>,
  pageSize = SUPABASE_PAGE_SIZE
): Promise<T[] | null> {
  return fetchAllPages<T>((from, to) => buildBaseQuery().range(from, to), pageSize);
}
