import { useQuery } from '@tanstack/react-query';
import { queryKeys, type PvzListScope } from '../../lib/queryKeys';
import { PVZ_LIST_STALE_MS } from '../../lib/queryClient';
import { fetchPvzList } from '../../services/query/pvzListQuery';

export function usePvzListQuery(
  scope: PvzListScope | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.pvzList(scope),
    queryFn: () => fetchPvzList(scope!),
    enabled: Boolean(scope) && options?.enabled !== false,
    staleTime: PVZ_LIST_STALE_MS,
    gcTime: PVZ_LIST_STALE_MS * 2,
  });
}
