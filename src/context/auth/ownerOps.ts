import * as SecureStore from 'expo-secure-store';
import { User, Pvz } from '../../types/user';
import DataService from '../../services/DataService';
import { AuthSetters } from './types';
import { userMemory, loadUsersFromStorage } from './userMemoryStore';
import { generateSecureId } from '../../utils/generateSecureId';
import { safeParseJson } from '../../utils/safeJson';
import { emailsMatch, normalizeEmail } from '../../utils/loginIdentifier';
import {
  getSupabaseSessionUserId,
  migrateLocalUserId,
  getCachedSessionUserId,
  resolveAuthAccessToken,
} from '../../services/SupabaseAuthService';
import { fetchOwnerPvzsForSessionUser } from '../../services/SupabasePvzService';

export async function checkOwnerExists(): Promise<boolean> {
  await loadUsersFromStorage();
  return userMemory.getUsers().some((u) => u.role === 'owner');
}

export interface OwnerPvzLoginResolution {
  ownerId: string | null;
  pvzList: Pvz[];
  localOwner: User | null;
}

function mergePvzLists(local: Pvz[], remote: Pvz[]): Pvz[] {
  const byId = new Map<string, Pvz>();
  for (const pvz of local) {
    byId.set(pvz.id, pvz);
  }
  for (const pvz of remote) {
    byId.set(pvz.id, { ...byId.get(pvz.id), ...pvz });
  }
  return Array.from(byId.values());
}

/** Локальные + облачные ПВЗ владельца после email OTP (или без OTP в dev). */
export async function resolveOwnerPvzsForLogin(
  normalizedEmail: string,
  sessionUserIdOverride?: string | null,
  sessionAccessTokenOverride?: string | null
): Promise<OwnerPvzLoginResolution> {
  await loadUsersFromStorage();
  const email = normalizeEmail(normalizedEmail);

  const localOwner =
    userMemory.getUsers().find(
      (u) => u.role === 'owner' && u.status === 'active' && emailsMatch(u.email, email)
    ) || null;

  const accessToken =
    sessionAccessTokenOverride ?? (await resolveAuthAccessToken());
  const sessionUserId =
    sessionUserIdOverride ??
    getCachedSessionUserId() ??
    (accessToken ? await getSupabaseSessionUserId() : null);

  let pvzList: Pvz[] = [];
  if (localOwner) {
    pvzList = await DataService.getPvzsByOwner(localOwner.id);
    if (sessionUserId && localOwner.id !== sessionUserId) {
      const migratedLocal = await DataService.getPvzsByOwner(sessionUserId);
      pvzList = mergePvzLists(pvzList, migratedLocal);
    }
  } else if (sessionUserId) {
    pvzList = await DataService.getPvzsByOwner(sessionUserId);
  }

  if (sessionUserId) {
    const remotePvzs = await fetchOwnerPvzsForSessionUser(
      sessionUserId,
      accessToken ?? undefined
    );
    if (remotePvzs.length > 0) {
      const ownerId = sessionUserId ?? localOwner?.id ?? remotePvzs[0].ownerId;
      pvzList = mergePvzLists(pvzList, remotePvzs).map((pvz) => ({
        ...pvz,
        ownerId,
      }));

      await Promise.all(pvzList.map((pvz) => DataService.savePvz(pvz)));
    } else if (__DEV__) {
      console.info('[Auth] resolveOwnerPvzsForLogin: no remote PVZ for owner', sessionUserId);
    }
  } else if (__DEV__) {
    console.info('[Auth] resolveOwnerPvzsForLogin: no session user id after OTP');
  }

  return {
    ownerId: sessionUserId ?? localOwner?.id ?? null,
    pvzList,
    localOwner,
  };
}

/** Создать или обновить локальную запись владельца перед PIN / выбором ПВЗ. */
export async function ensureLocalOwnerRecord(
  normalizedEmail: string,
  ownerId: string,
  primaryPvzId?: string,
  ownerName?: string
): Promise<User> {
  await loadUsersFromStorage();
  const email = normalizeEmail(normalizedEmail);
  let owner =
    userMemory.getUsers().find(
      (u) => u.role === 'owner' && u.status === 'active' && emailsMatch(u.email, email)
    ) || null;

  if (owner && owner.id !== ownerId) {
    await migrateLocalUserId(owner.id, ownerId, 'owner');
    await userMemory.replaceUserId(owner.id, ownerId);
    owner = { ...owner, id: ownerId };
  }

  if (!owner) {
    owner = {
      id: ownerId,
      name: ownerName || 'Владелец',
      email,
      phone: '',
      role: 'owner',
      status: 'active',
      pvzId: primaryPvzId,
      createdAt: new Date().toISOString(),
    };
    await userMemory.addUser(owner);
    return owner;
  }

  if (primaryPvzId && owner.pvzId !== primaryPvzId) {
    await userMemory.updateUser(ownerId, { pvzId: primaryPvzId });
    owner = { ...owner, pvzId: primaryPvzId };
  }

  return owner;
}

export async function registerOwnerAccount(
  phone: string,
  name: string,
  pvzName: string,
  address: string,
  setters: AuthSetters
) {
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  if (await checkOwnerExists()) {
    throw new Error('Владелец уже зарегистрирован в системе');
  }

  if (userMemory.getUsers().some((u) => u.phone === cleanPhone)) {
    throw new Error('Пользователь с таким номером уже зарегистрирован');
  }

  const ownerId = generateSecureId('owner');
  const newOwner: User = {
    id: ownerId,
    name,
    email: `${cleanPhone}@users.pvzpersonal.ru`,
    phone: cleanPhone,
    role: 'owner',
    status: 'active',
    createdAt: new Date().toISOString(),
    passwordHash: '',
  };

  await userMemory.addUser(newOwner);

  const newPvz: Pvz = {
    id: generateSecureId('pvz'),
    name: pvzName,
    address,
    workingHours: '10:00 - 21:00',
    workStart: '10:00',
    workEnd: '21:00',
    phone: cleanPhone,
    ownerId,
  };

  await DataService.savePvz(newPvz);

  setters.setUser(newOwner);
  await SecureStore.setItemAsync('user', JSON.stringify(newOwner));

  const ownerPvzs = await DataService.getPvzsByOwner(newOwner.id);
  setters.setUserPvzs(ownerPvzs);
  if (ownerPvzs.length > 0) {
    setters.setPvz(ownerPvzs[0]);
    await SecureStore.setItemAsync('pvz', JSON.stringify(ownerPvzs[0]));
  }
}

export async function blockUserAccount(
  userId: string,
  currentUserId: string | undefined,
  signOut: () => Promise<void>
) {
  const users = await DataService.getUsers();
  const userIndex = users.findIndex((u) => u.id === userId);

  if (userIndex === -1) return;

  users[userIndex].status = 'blocked';
  await SecureStore.setItemAsync('pvz_users', JSON.stringify(users));

  await userMemory.updateUser(userId, { status: 'blocked' });

  if (currentUserId === userId) {
    await signOut();
  }

  const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
  if (allInvitationsRaw) {
    const allInvitations = safeParseJson<Array<{ phone: string; status: string }>>(
      allInvitationsRaw,
      []
    );
    allInvitations.forEach((inv) => {
      if (inv.phone === users[userIndex].phone) {
        inv.status = 'expired';
      }
    });
    await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
  }
}

export { deleteUserAccount } from '../../services/accountLifecycle';
