import DataService from '../DataService';
import { fetchOwnerPvzsForSessionUser } from '../SupabasePvzService';
import { Pvz } from '../../types/user';
import type { PvzListScope } from '../../lib/queryKeys';

export async function fetchPvzList(scope: PvzListScope): Promise<Pvz[]> {
  switch (scope.kind) {
    case 'owner': {
      const local = await DataService.getPvzsByOwner(scope.ownerId);
      if (local.length > 0) return local;
      return fetchOwnerPvzsForSessionUser(scope.ownerId);
    }
    case 'admin':
      return DataService.getPvzsForAdmin(scope.admin);
    case 'all':
      return DataService.getPvzs();
  }
}
