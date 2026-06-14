import * as SecureStore from 'expo-secure-store';
import { User } from '../../types/user';
import {
  fetchInvitationsFromSupabase,
  mergeInvitations,
  upsertInvitationToSupabase,
  updateInvitationStatusInSupabase,
} from '../SupabaseInvitationService';
import { dataEventBus } from './dataEventBus';
import { Invitation } from './dataTypes';
import { safeParseJson } from '../../utils/safeJson';

export async function getInvitations(ownerId: string): Promise<Invitation[]> {
  const stored = await SecureStore.getItemAsync(`invitations_${ownerId}`);
  const local = safeParseJson<Invitation[]>(stored ?? '[]', []);
  const remote = await fetchInvitationsFromSupabase();

  if (remote === null) {
    return local;
  }

  const ownerRemote = remote.filter((inv) => inv.invitedBy === ownerId);
  if (ownerRemote.length === 0) {
    return local;
  }

  const merged = mergeInvitations(local, ownerRemote).map((inv) => ({
    ...inv,
    pvzName: inv.pvzName ?? '',
  }));
  await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(merged));
  return merged;
}

export async function addInvitation(ownerId: string, invitation: Invitation): Promise<void> {
  const invitations = await getInvitations(ownerId);
  invitations.push(invitation);
  await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(invitations));
  const synced = await upsertInvitationToSupabase(invitation);
  if (synced && synced.id !== invitation.id) {
    await updateInvitation(ownerId, invitation.id, {
      id: synced.id,
      pvzId: synced.pvzId,
    } as Partial<Invitation>);
  }
  dataEventBus.notify(`invitations_${ownerId}`);
}

export async function updateInvitation(
  ownerId: string,
  id: string,
  updates: Partial<Invitation>
): Promise<void> {
  const invitations = await getInvitations(ownerId);
  const index = invitations.findIndex((i) => i.id === id);

  if (index !== -1) {
    invitations[index] = { ...invitations[index], ...updates };
    await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(invitations));
    if (updates.status) {
      await updateInvitationStatusInSupabase(invitations[index].id, updates.status);
    }
    dataEventBus.notify(`invitations_${ownerId}`);
  }
}

export async function deleteInvitation(ownerId: string, id: string): Promise<void> {
  const invitations = await getInvitations(ownerId);
  const filtered = invitations.filter((i) => i.id !== id);
  await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(filtered));
  dataEventBus.notify(`invitations_${ownerId}`);
}

export async function resendInvitation(ownerId: string, id: string): Promise<Invitation> {
  const invitations = await getInvitations(ownerId);
  const index = invitations.findIndex((i) => i.id === id);
  if (index === -1) {
    throw new Error('Приглашение не найдено');
  }

  const invitation = invitations[index];
  if (invitation.status !== 'pending') {
    throw new Error('Можно обновить только ожидающее приглашение');
  }

  const updated: Invitation = {
    ...invitation,
    createdAt: new Date().toISOString(),
  };
  invitations[index] = updated;
  await SecureStore.setItemAsync(`invitations_${ownerId}`, JSON.stringify(invitations));

  const allRaw = await SecureStore.getItemAsync('all_invitations');
  const allInvitations = safeParseJson<Invitation[]>(allRaw ?? '[]', []);
  const cleanPhone = String(invitation.phone).replace(/[^0-9]/g, '');
  const allUpdated = allInvitations.map((inv) => {
    const invPhone = String(inv.phone).replace(/[^0-9]/g, '');
    if (inv.id === id || invPhone === cleanPhone) {
      return { ...inv, ...updated, status: 'pending' as const };
    }
    return inv;
  });
  await SecureStore.setItemAsync('all_invitations', JSON.stringify(allUpdated));

  await upsertInvitationToSupabase(updated);
  dataEventBus.notify(`invitations_${ownerId}`);
  return updated;
}

export async function refreshInvitationsForLogin(): Promise<void> {
  const remote = await fetchInvitationsFromSupabase();
  if (!remote) return;

  const allRaw = await SecureStore.getItemAsync('all_invitations');
  const allLocal = safeParseJson<Invitation[]>(allRaw ?? '[]', []);
  const mergedAll = mergeInvitations(allLocal, remote);
  await SecureStore.setItemAsync('all_invitations', JSON.stringify(mergedAll));
  dataEventBus.emitChange('all_invitations');
}

export async function refreshInvitationsCache(sessionUser: User): Promise<void> {
  await refreshInvitationsForLogin();

  if (sessionUser.role === 'owner' || sessionUser.role === 'admin') {
    const allRaw = await SecureStore.getItemAsync('all_invitations');
    const mergedAll = safeParseJson<Invitation[]>(allRaw ?? '[]', []);
    const ownerList = mergedAll.filter((inv) => inv.invitedBy === sessionUser.id);
    await SecureStore.setItemAsync(`invitations_${sessionUser.id}`, JSON.stringify(ownerList));
    dataEventBus.emitChange(`invitations_${sessionUser.id}`);
  }
}
