import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { PROFILE_STALE_MS } from '../../lib/queryClient';
import { fetchProfile } from '../../services/query/profileQuery';

export function useProfileQuery(userId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.profile(userId ?? ''),
    queryFn: () => fetchProfile(userId!),
    enabled: Boolean(userId) && options?.enabled !== false,
    staleTime: PROFILE_STALE_MS,
    gcTime: PROFILE_STALE_MS * 2,
  });
}
