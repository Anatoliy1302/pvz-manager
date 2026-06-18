import type { User } from '../types/user';

export type PvzListScope =
  | { kind: 'owner'; ownerId: string }
  | { kind: 'admin'; admin: Pick<User, 'pvzId' | 'pvzIds'> }
  | { kind: 'all' };

function pvzListKeyPart(scope: PvzListScope): unknown[] {
  switch (scope.kind) {
    case 'owner':
      return ['owner', scope.ownerId];
    case 'admin':
      return ['admin', scope.admin.pvzId, scope.admin.pvzIds];
    case 'all':
      return ['all'];
  }
}

export const queryKeys = {
  pvzList: (scope: PvzListScope | null) =>
    scope ? (['pvz', 'list', ...pvzListKeyPart(scope)] as const) : (['pvz', 'list'] as const),
  employees: (pvzId?: string) => (pvzId ? (['employees', pvzId] as const) : (['employees'] as const)),
  shifts: (pvzId?: string) => (pvzId ? (['shifts', pvzId] as const) : (['shifts'] as const)),
  profile: (userId: string) => ['profile', userId] as const,
};
