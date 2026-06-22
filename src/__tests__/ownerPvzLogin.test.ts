import { resolveOwnerPvzsForLogin } from '../context/auth/ownerOps';
import { Pvz } from '../types/user';

jest.mock('../services/accountLifecycle', () => ({
  deleteUserAccount: jest.fn(),
}));

jest.mock('../services/DataService', () => ({
  __esModule: true,
  default: {
    getPvzsByOwner: jest.fn(),
    savePvz: jest.fn(async () => undefined),
  },
}));

jest.mock('../services/SupabasePvzService', () => ({
  fetchOwnerPvzsForSessionUser: jest.fn(),
}));

jest.mock('../context/auth/userMemoryStore', () => ({
  loadUsersFromStorage: jest.fn(async () => undefined),
  userMemory: {
    getUsers: jest.fn(() => []),
  },
}));

jest.mock('../services/SupabaseAuthService', () => ({
  getCachedSessionUserId: jest.fn(() => 'owner-uuid-1'),
  resolveAuthAccessToken: jest.fn(async () => 'access-token'),
  getSupabaseSessionUserId: jest.fn(async () => 'owner-uuid-1'),
}));

const DataService = jest.requireMock('../services/DataService').default;
const { fetchOwnerPvzsForSessionUser } = jest.requireMock('../services/SupabasePvzService');

const remotePvz: Pvz = {
  id: 'remote-pvz-1',
  name: 'ПВЗ из облака',
  address: 'ул. Облачная, 2',
  workStart: '09:00',
  workEnd: '21:00',
  workingHours: '09:00 - 21:00',
  phone: '',
  ownerId: 'owner-uuid-1',
};

describe('resolveOwnerPvzsForLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DataService.getPvzsByOwner.mockResolvedValue([]);
  });

  it('loads existing PVZ from Supabase on repeat login without creating a new one', async () => {
    fetchOwnerPvzsForSessionUser.mockResolvedValue([remotePvz]);

    const result = await resolveOwnerPvzsForLogin('owner@test.ru', 'owner-uuid-1', 'token');

    expect(result.pvzList).toHaveLength(1);
    expect(result.pvzList[0].id).toBe('remote-pvz-1');
    expect(DataService.savePvz).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'remote-pvz-1', ownerId: 'owner-uuid-1' })
    );
    expect(fetchOwnerPvzsForSessionUser).toHaveBeenCalledWith('owner-uuid-1', 'token');
  });

  it('returns empty list for new owner without remote PVZ', async () => {
    fetchOwnerPvzsForSessionUser.mockResolvedValue([]);

    const result = await resolveOwnerPvzsForLogin('new@test.ru', 'new-owner-uuid', 'token');

    expect(result.pvzList).toHaveLength(0);
    expect(result.ownerId).toBe('new-owner-uuid');
  });
});
