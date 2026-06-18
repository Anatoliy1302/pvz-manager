import { supabase } from '../../lib/supabase';
import { resolveAuthAccessToken } from './SupabaseAuthService';

export class AccountDeletionError extends Error {
  constructor(
    message: string,
    public readonly code?: 'auth_required' | 'reauth_required' | 'unknown'
  ) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

export async function deleteRemoteAccount(): Promise<void> {
  const accessToken = await resolveAuthAccessToken();
  if (!accessToken) {
    return;
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
    'delete-account',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (error) {
    throw new AccountDeletionError(error.message || 'Не удалось удалить аккаунт');
  }

  if (data?.error) {
    throw new AccountDeletionError(data.error);
  }

  if (!data?.ok) {
    throw new AccountDeletionError('Не удалось удалить аккаунт');
  }
}

/** Permanent account deletion — App Store Guideline 5.1.1 */
export const deleteUserAccount = deleteRemoteAccount;
