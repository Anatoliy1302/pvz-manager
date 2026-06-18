/**
 * User account lifecycle — registration and account deletion.
 * Apple App Store Guideline 5.1.1 (in-app account deletion).
 */
export {
  deleteRemoteAccount,
  deleteRemoteAccount as deleteUserAccount,
  AccountDeletionError,
} from './accountDeletionService';

/** Edge Function: permanent account deletion. */
export const ACCOUNT_DELETION_API = 'delete-account';

/** In-app navigation route for account deletion. */
export const ACCOUNT_DELETION_SCREEN = 'DeleteAccount';

/** Account deletion is supported in-app (Settings → Security, Profile). */
export const ACCOUNT_DELETION_ENABLED = true;
