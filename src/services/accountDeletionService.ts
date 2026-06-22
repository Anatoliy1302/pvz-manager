import { resolveAuthAccessToken } from './SupabaseAuthService';
import PinService from './PinService';
import { normalizeEmail } from '../utils/loginIdentifier';
import {
  deleteAccountWithToken,
  deleteOwnerAccountByPin,
} from '../../lib/accountApi';

export class AccountDeletionError extends Error {
  constructor(
    message: string,
    public readonly code?: 'auth_required' | 'invalid_pin' | 'reauth_required' | 'unknown'
  ) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

export type DeleteAccountOptions = {
  accessToken?: string;
  ownerPin?: {
    email: string;
    userId: string;
    pin: string;
  };
};

function mapDeleteError(message: string): AccountDeletionError {
  const lower = message.toLowerCase();
  if (lower.includes('invalid pin')) {
    return new AccountDeletionError('Неверный PIN', 'invalid_pin');
  }
  if (lower.includes('no token') || lower.includes('unauthorized')) {
    return new AccountDeletionError('Для удаления аккаунта введите PIN.', 'auth_required');
  }
  return new AccountDeletionError(message);
}

export async function deleteRemoteAccount(options?: DeleteAccountOptions): Promise<void> {
  if (options?.ownerPin) {
    const { email, userId, pin } = options.ownerPin;
    const normalized = normalizeEmail(email);
    const pinValid = await PinService.verifyPin(normalized, pin);
    if (!pinValid) {
      throw new AccountDeletionError('Неверный PIN', 'invalid_pin');
    }
    try {
      await deleteOwnerAccountByPin(normalized, userId, pin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить аккаунт';
      throw mapDeleteError(message);
    }
    return;
  }

  const accessToken =
    options?.accessToken?.trim() || (await resolveAuthAccessToken());
  if (!accessToken) {
    throw new AccountDeletionError(
      'Для удаления аккаунта введите PIN.',
      'auth_required'
    );
  }

  try {
    await deleteAccountWithToken(accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось удалить аккаунт';
    throw mapDeleteError(message);
  }
}

/** Permanent account deletion — App Store Guideline 5.1.1 */
export const deleteUserAccount = deleteRemoteAccount;
