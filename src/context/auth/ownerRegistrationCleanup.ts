import * as SecureStore from 'expo-secure-store';
import PinService from '../../services/PinService';
import { checkOwnerEmailExistsOnServer } from '../../../lib/authApi';
import { emailsMatch, normalizeEmail } from '../../utils/loginIdentifier';
import { clearOwnerPinLoginSnapshot } from '../../utils/ownerPinLoginStore';
import { safeParseJson } from '../../utils/safeJson';
import { loadUsersFromStorage, userMemory } from './userMemoryStore';

/** Короткий таймаут — при сбое не блокируем UX. */
const OWNER_EMAIL_CHECK_TIMEOUT_MS = 4_000;

/** Есть ли email на сервере. false = точно нет; true/null = да или неизвестно. */
export async function checkOwnerEmailRegisteredRemotely(email: string): Promise<boolean> {
  const remote = await checkOwnerEmailExistsRemotely(email);
  return remote === true;
}

/**
 * Для входа: email в облаке?
 * null/timeout → null (не блокируем вход).
 */
export async function checkOwnerEmailExistsRemotely(email: string): Promise<boolean | null> {
  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), OWNER_EMAIL_CHECK_TIMEOUT_MS);
  });
  return Promise.race([checkOwnerEmailExistsOnServer(email), timeout]);
}

/**
 * Локальные остатки после «удаления» без JWT или выхода:
 * PIN, снимок входа, запись в pvz_users.
 */
export async function clearOrphanedOwnerLocalAuth(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;

  try {
    await PinService.clearPin(normalized);
  } catch {
    // ignore
  }

  try {
    await clearOwnerPinLoginSnapshot(normalized);
  } catch {
    // ignore
  }

  try {
    await loadUsersFromStorage();
    const users = userMemory.getUsers();
    const next = users.filter(
      (u) => !(u.role === 'owner' && u.email && emailsMatch(u.email, normalized))
    );
    if (next.length !== users.length) {
      userMemory.setUsers(next);
      await userMemory.persistUsers();
    }
  } catch {
    // ignore
  }

  try {
    const sessionRaw = await SecureStore.getItemAsync('user');
    if (sessionRaw) {
      const parsed = safeParseJson<{ role?: string; email?: string } | null>(sessionRaw, null);
      if (
        parsed?.role === 'owner' &&
        parsed.email &&
        emailsMatch(parsed.email, normalized)
      ) {
        await SecureStore.deleteItemAsync('user');
        await SecureStore.deleteItemAsync('pvz');
      }
    }
  } catch {
    // ignore
  }
}
