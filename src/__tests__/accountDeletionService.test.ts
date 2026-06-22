jest.mock('../../lib/accountApi', () => ({
  deleteAccountWithToken: jest.fn(async () => undefined),
  deleteOwnerAccountByPin: jest.fn(async () => undefined),
}));

jest.mock('../services/SupabaseAuthService', () => ({
  resolveAuthAccessToken: jest.fn(async () => null),
}));

jest.mock('../services/PinService', () => ({
  __esModule: true,
  default: {
    verifyPin: jest.fn(async () => true),
    getStoredPinHash: jest.fn(async () => 'v1:abc:def'),
  },
}));

import { deleteRemoteAccount, AccountDeletionError } from '../services/accountDeletionService';
import { resolveAuthAccessToken } from '../services/SupabaseAuthService';
import {
  deleteAccountWithToken,
  deleteOwnerAccountByPin,
} from '../../lib/accountApi';
import PinService from '../services/PinService';

describe('deleteRemoteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws auth_required when there is no JWT and no PIN', async () => {
    await expect(deleteRemoteAccount()).rejects.toMatchObject({
      name: 'AccountDeletionError',
      code: 'auth_required',
    });
    expect(resolveAuthAccessToken).toHaveBeenCalled();
  });

  it('uses accessToken override without resolveAuthAccessToken', async () => {
    await deleteRemoteAccount({ accessToken: 'jwt-from-session' });

    expect(resolveAuthAccessToken).not.toHaveBeenCalled();
    expect(deleteAccountWithToken).toHaveBeenCalledWith('jwt-from-session');
  });

  it('deletes owner via PIN without JWT', async () => {
    await deleteRemoteAccount({
      ownerPin: { email: 'owner@test.ru', userId: 'user-1', pin: '1234' },
    });

    expect(PinService.verifyPin).toHaveBeenCalledWith('owner@test.ru', '1234');
    expect(deleteOwnerAccountByPin).toHaveBeenCalledWith(
      'owner@test.ru',
      'user-1',
      '1234'
    );
  });

  it('throws invalid_pin when local PIN check fails', async () => {
    (PinService.verifyPin as jest.Mock).mockResolvedValueOnce(false);

    await expect(
      deleteRemoteAccount({
        ownerPin: { email: 'owner@test.ru', userId: 'user-1', pin: '0000' },
      })
    ).rejects.toMatchObject({
      code: 'invalid_pin',
    });
  });
});
