import * as SecureStore from 'expo-secure-store';
import { addEmployeeInvitation } from '../context/auth/employeeOps';
import { User, Pvz, defaultPermissions } from '../types/user';

jest.mock('../services/DataService', () => ({
  __esModule: true,
  default: {
    getInvitations: jest.fn(async () => []),
    getPvzsByOwner: jest.fn(async () => [
      {
        id: 'pvz-1',
        name: 'ПВЗ Тест',
        address: 'ул. 1',
        workStart: '09:00',
        workEnd: '21:00',
        workingHours: '09:00 - 21:00',
        phone: '',
        ownerId: 'owner-1',
      },
    ]),
    savePvz: jest.fn(async () => undefined),
    getPvzById: jest.fn(async () => ({
      id: 'pvz-1',
      name: 'ПВЗ Тест',
      address: 'ул. 1',
      workStart: '09:00',
      workEnd: '21:00',
      workingHours: '09:00 - 21:00',
      phone: '',
      ownerId: 'owner-1',
    })),
    emitChange: jest.fn(),
  },
}));

jest.mock('../services/SupabasePvzService', () => ({
  ensurePvzSynced: jest.fn(async (pvz: Pvz) =>
    pvz.id.startsWith('pvz-') ? '11111111-1111-4111-8111-111111111111' : pvz.id
  ),
  loadOwnerPvzsWithRemoteFallback: jest.fn(async () => []),
}));

jest.mock('../services/SupabaseInvitationService', () => ({
  upsertInvitationToSupabase: jest.fn(async (inv) => inv),
}));

jest.mock('../services/SupabaseAuthService', () => ({
  hasStoredAuthTokens: jest.fn(async () => true),
}));

jest.mock('../utils/generateSecureId', () => ({
  generateSecureId: jest.fn((prefix: string) => `${prefix}-test-id`),
}));

jest.mock('../context/auth/userMemoryStore', () => {
  const pending: User[] = [];
  const users: User[] = [];
  return {
    MAX_EMPLOYEES_PER_PVZ: 50,
    loadUsersFromStorage: jest.fn(async () => undefined),
    refreshPendingEmployees: jest.fn(async () => undefined),
    userMemory: {
      getUsers: () => users,
      getPendingEmployees: () => pending,
      addPending: jest.fn(async (u: User) => {
        pending.push(u);
      }),
    },
  };
});

const owner: User = {
  id: 'owner-1',
  name: 'Владелец',
  email: 'owner@test.ru',
  phone: '',
  role: 'owner',
  status: 'active',
  pvzId: 'pvz-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordHash: '',
};

const pvz: Pvz = {
  id: 'pvz-1',
  name: 'ПВЗ Тест',
  address: 'ул. 1',
  workStart: '09:00',
  workEnd: '21:00',
  workingHours: '09:00 - 21:00',
  phone: '',
  ownerId: 'owner-1',
};

describe('addEmployeeInvitation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('[]');
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('creates pending employee with role employee', async () => {
    const { userMemory } = jest.requireMock('../context/auth/userMemoryStore');

    await addEmployeeInvitation('8 (900) 123-45-67', 'Иван Сотрудник', 'employee', owner, pvz);

    expect(userMemory.addPending).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Иван Сотрудник',
        phone: '79001234567',
        role: 'employee',
        status: 'pending',
        pvzId: 'pvz-1',
        permissions: expect.objectContaining(defaultPermissions),
      })
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'all_invitations',
      expect.stringContaining('79001234567')
    );
  });

  it('rejects invitation from employee role', async () => {
    const employee: User = { ...owner, id: 'emp-1', role: 'employee', phone: '79009999999' };

    await expect(
      addEmployeeInvitation('8 (900) 111-22-33', 'Test', 'employee', employee, pvz)
    ).rejects.toThrow('Только владелец или администратор');
  });

  it('rejects invalid phone', async () => {
    await expect(
      addEmployeeInvitation('123', 'Test', 'employee', owner, pvz)
    ).rejects.toThrow('Некорректный номер телефона');
  });
});
