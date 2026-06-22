import {
  checkOwnerEmailRegisteredRemotely,
  checkOwnerEmailExistsRemotely,
  clearOrphanedOwnerLocalAuth,
} from '../context/auth/ownerRegistrationCleanup';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('../../lib/supabaseRest', () => ({
  supabaseRestRpcAnon: jest.fn(),
}));

jest.mock('../services/PinService', () => ({
  __esModule: true,
  default: {
    clearPin: jest.fn(async () => undefined),
  },
}));

jest.mock('../utils/ownerPinLoginStore', () => ({
  clearOwnerPinLoginSnapshot: jest.fn(async () => undefined),
}));

jest.mock('../context/auth/userMemoryStore', () => ({
  loadUsersFromStorage: jest.fn(async () => undefined),
  userMemory: {
    getUsers: jest.fn(() => [
      { id: 'local-owner', role: 'owner', email: 'test@mail.ru', status: 'active' },
    ]),
    setUsers: jest.fn(),
    persistUsers: jest.fn(async () => undefined),
  },
}));

import { supabaseRestRpcAnon } from '../../lib/supabaseRest';
import PinService from '../services/PinService';

describe('owner registration email check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkOwnerEmailRegisteredRemotely is false when RPC returns false', async () => {
    (supabaseRestRpcAnon as jest.Mock).mockResolvedValue(false);

    await expect(checkOwnerEmailRegisteredRemotely('test@mail.ru')).resolves.toBe(false);
  });

  it('checkOwnerEmailRegisteredRemotely is true only when RPC returns true', async () => {
    (supabaseRestRpcAnon as jest.Mock).mockResolvedValue(true);

    await expect(checkOwnerEmailRegisteredRemotely('test@mail.ru')).resolves.toBe(true);
  });

  it('checkOwnerEmailRegisteredRemotely allows registration when RPC is unavailable', async () => {
    (supabaseRestRpcAnon as jest.Mock).mockResolvedValue(null);

    await expect(checkOwnerEmailRegisteredRemotely('test@mail.ru')).resolves.toBe(false);
  });

  it('checkOwnerEmailExistsRemotely returns null when RPC is unavailable', async () => {
    (supabaseRestRpcAnon as jest.Mock).mockResolvedValue(null);

    await expect(checkOwnerEmailExistsRemotely('test@mail.ru')).resolves.toBeNull();
  });

  it('clearOrphanedOwnerLocalAuth removes local PIN', async () => {
    await clearOrphanedOwnerLocalAuth('test@mail.ru');

    expect(PinService.clearPin).toHaveBeenCalledWith('test@mail.ru');
  });
});
