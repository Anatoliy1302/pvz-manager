import { resolveOwnerRouteAfterEmailOtp } from '../context/auth/remoteSignInFlow';
import { Pvz } from '../types/user';

jest.mock('../services/SupabaseAuthService', () => ({
  linkSupabaseProfile: jest.fn(async () => null),
  migrateLocalUserId: jest.fn(async () => undefined),
  isSupabaseProviderConfigError: jest.fn(() => false),
  ensureSupabaseClientSession: jest.fn(async () => undefined),
  getCachedSessionUserId: jest.fn(() => null),
  getSupabaseSessionUserId: jest.fn(async () => null),
  resolveAuthAccessToken: jest.fn(async () => null),
  hasStoredAuthTokens: jest.fn(async () => false),
  ensureStaffProfileForLogin: jest.fn(async () => true),
}));

jest.mock('../context/auth/userMemoryStore', () => ({
  userMemory: {
    replaceUserId: jest.fn(async () => undefined),
  },
}));

jest.mock('../context/auth/ownerOps', () => ({
  resolveOwnerPvzsForLogin: jest.fn(),
  ensureLocalOwnerRecord: jest.fn(async () => undefined),
}));

jest.mock('../utils/supabaseHelpers', () => ({
  isUuid: jest.fn(() => false),
  resolvePvzId: jest.fn(async (id: string) => id),
}));

jest.mock('../i18n', () => ({
  t: (key: string) => key,
}));

const { resolveOwnerPvzsForLogin, ensureLocalOwnerRecord } = jest.requireMock(
  '../context/auth/ownerOps'
);

const samplePvz: Pvz = {
  id: 'pvz-uuid-1',
  name: 'ПВЗ Тест',
  address: 'ул. Тестовая, 1',
  workStart: '09:00',
  workEnd: '21:00',
  workingHours: '09:00 - 21:00',
  phone: '',
  ownerId: 'owner-uuid-1',
};

describe('resolveOwnerRouteAfterEmailOtp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes to createPvz when owner has no PVZ and no local PIN', async () => {
    resolveOwnerPvzsForLogin.mockResolvedValue({
      ownerId: 'owner-uuid-1',
      pvzList: [],
      localOwner: null,
    });

    const result = await resolveOwnerRouteAfterEmailOtp('owner@test.ru', false, 'owner-uuid-1');

    expect(result.route).toBe('createPvz');
    expect(result.pvzList).toHaveLength(0);
    expect(ensureLocalOwnerRecord).toHaveBeenCalledWith(
      'owner@test.ru',
      'owner-uuid-1',
      undefined
    );
  });

  it('routes to selectPvz when PVZ already exists (repeat login)', async () => {
    resolveOwnerPvzsForLogin.mockResolvedValue({
      ownerId: 'owner-uuid-1',
      pvzList: [samplePvz],
      localOwner: { id: 'owner-uuid-1', role: 'owner' },
    });

    const result = await resolveOwnerRouteAfterEmailOtp('owner@test.ru', true, 'owner-uuid-1');

    expect(result.route).toBe('selectPvz');
    expect(result.pvzList).toHaveLength(1);
    expect(result.pvzList[0].name).toBe('ПВЗ Тест');
  });

  it('routes to pin when owner exists locally with PIN but no remote PVZ yet', async () => {
    resolveOwnerPvzsForLogin.mockResolvedValue({
      ownerId: 'owner-uuid-1',
      pvzList: [],
      localOwner: { id: 'owner-uuid-1', role: 'owner' },
    });

    const result = await resolveOwnerRouteAfterEmailOtp('owner@test.ru', true, 'owner-uuid-1');

    expect(result.route).toBe('pin');
  });
});
