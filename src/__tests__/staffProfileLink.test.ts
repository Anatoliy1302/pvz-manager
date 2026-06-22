jest.mock('../context/auth/ownerOps', () => ({
  resolveOwnerPvzsForLogin: jest.fn(),
  ensureLocalOwnerRecord: jest.fn(async () => undefined),
}));

jest.mock('../utils/supabaseHelpers', () => ({
  isUuid: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
  resolvePvzId: jest.fn(
    async (id: string) => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  ),
}));

jest.mock('../i18n', () => ({
  t: (key: string) => key,
}));

jest.mock('../services/SupabaseAuthService', () => ({
  linkSupabaseProfile: jest.fn(async () => 'owner-uuid'),
  migrateLocalUserId: jest.fn(async () => undefined),
  isSupabaseProviderConfigError: jest.fn(() => false),
  ensureSupabaseClientSession: jest.fn(async () => undefined),
  getCachedSessionUserId: jest.fn(() => 'staff-uuid-1'),
  getSupabaseSessionUserId: jest.fn(async () => 'staff-uuid-1'),
  resolveAuthAccessToken: jest.fn(async () => 'token'),
  hasStoredAuthTokens: jest.fn(async () => true),
  ensureStaffProfileForLogin: jest.fn(async () => true),
}));

jest.mock('../context/auth/userMemoryStore', () => ({
  userMemory: {
    replaceUserId: jest.fn(async () => undefined),
  },
}));

import { linkRemoteProfile } from '../context/auth/remoteSignInFlow';
import { User } from '../types/user';

const { ensureStaffProfileForLogin, linkSupabaseProfile } = jest.requireMock(
  '../services/SupabaseAuthService'
);

const adminUser: User = {
  id: 'local-admin-1',
  name: 'Админ',
  email: '79001112233@users.pvzpersonal.ru',
  phone: '79001112233',
  role: 'admin',
  status: 'active',
  pvzId: 'pvz-local-1',
  pvzIds: ['pvz-local-1'],
  permissionLevel: 'full',
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordHash: '',
};

describe('linkRemoteProfile staff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls ensureStaffProfileForLogin for admin with resolved pvz UUIDs', async () => {
    const result = await linkRemoteProfile(adminUser, '79001112233');

    expect(ensureStaffProfileForLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'admin',
        name: 'Админ',
        pvzId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        pvzIds: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
        permissionLevel: 'full',
        status: 'active',
      })
    );
    expect(linkSupabaseProfile).not.toHaveBeenCalled();
    expect(result.id).toBe('staff-uuid-1');
  });
});
