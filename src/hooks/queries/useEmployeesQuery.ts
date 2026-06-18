import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { EMPLOYEES_STALE_MS } from '../../lib/queryClient';
import { fetchEmployeesList } from '../../services/query/employeesQuery';

export function useEmployeesQuery(pvzId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.employees(pvzId),
    queryFn: () => fetchEmployeesList(pvzId),
    enabled: options?.enabled !== false,
    staleTime: EMPLOYEES_STALE_MS,
    gcTime: EMPLOYEES_STALE_MS * 2,
  });
}
