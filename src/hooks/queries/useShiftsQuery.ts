import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { SHIFTS_STALE_MS } from '../../lib/queryClient';
import { fetchShiftsFromSupabase, fetchShiftsList } from '../../services/query/shiftsQuery';

export function useShiftsQuery(pvzId?: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.shifts(pvzId),
    queryFn: () => fetchShiftsList(pvzId),
    enabled: options?.enabled !== false,
    staleTime: SHIFTS_STALE_MS,
    gcTime: SHIFTS_STALE_MS * 2,
  });

  const refreshFromSupabase = useCallback(async () => {
    const data = await fetchShiftsFromSupabase(pvzId);
    queryClient.setQueryData(queryKeys.shifts(pvzId), data);
    return data;
  }, [pvzId, queryClient]);

  return { ...query, refreshFromSupabase };
}
