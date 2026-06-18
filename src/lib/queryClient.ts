import { MutationCache, QueryClient } from '@tanstack/react-query';
import { reportGlobalError } from '../utils/globalErrorReporter';

/** Список ПВЗ и сотрудников — 5 минут. */
export const PVZ_LIST_STALE_MS = 5 * 60 * 1000;
export const EMPLOYEES_STALE_MS = 5 * 60 * 1000;

/** Смены — 2 минуты. */
export const SHIFTS_STALE_MS = 2 * 60 * 1000;

/** Профиль из Supabase — 10 минут. */
export const PROFILE_STALE_MS = 10 * 60 * 1000;

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silentError) return;
      reportGlobalError(error);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export function clearQueryCache(): void {
  queryClient.clear();
}
