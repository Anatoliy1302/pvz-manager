import { getToken } from '../../lib/authSessionStore';
import { pushSync } from '../../lib/syncService';
import PinService from './PinService';
import { normalizeEmail } from '../utils/loginIdentifier';

/** Синхронизация PIN-хеша и локального состояния с сервером. */
export async function syncOwnerPinHashToCloud(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  const token = await getToken();
  if (!token) return;

  const pinHash = await PinService.getStoredPinHash(normalized);
  if (!pinHash) return;

  try {
    await pushSync({
      ownerPinHash: pinHash,
      email: normalized,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[Auth] syncOwnerPinHashToCloud:', error);
    }
  }
}
