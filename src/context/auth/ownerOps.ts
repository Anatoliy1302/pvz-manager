import * as SecureStore from 'expo-secure-store';
import { User, Pvz } from '../../types/user';
import DataService from '../../services/DataService';
import { AuthSetters } from './types';
import { userMemory, loadUsersFromStorage } from './userMemoryStore';
import { generateSecureId } from '../../utils/generateSecureId';
import { safeParseJson } from '../../utils/safeJson';

export async function checkOwnerExists(): Promise<boolean> {
  await loadUsersFromStorage();
  return userMemory.getUsers().some((u) => u.role === 'owner');
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
    email: `${cleanPhone}@pvz.owner`,
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
