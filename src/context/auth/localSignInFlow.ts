import * as SecureStore from 'expo-secure-store';
import { User, UserRole } from '../../types/user';
import { t } from '../../i18n';
import { safeParseJson } from '../../utils/safeJson';
import { generateSecureId } from '../../utils/generateSecureId';
import { normalizeEmail, emailsMatch } from '../../utils/loginIdentifier';
import { DEMO_MODE, hasSupabaseSession } from '../../services/SupabaseAuthService';
import { fetchInvitationByPhone, updateInvitationStatusInSupabase } from '../../services/SupabaseInvitationService';
import { DEMO_USERS } from './demoData';
import { SignInOptions } from './types';
import { userMemory } from './userMemoryStore';

function roleLabel(role: UserRole): string {
  if (role === 'owner') return t('common.roles.owner');
  if (role === 'admin') return t('common.roles.admin');
  return t('common.roles.employee');
}

export async function resolveLocalUser(
  loginKey: string,
  selectedRole: UserRole,
  options?: SignInOptions
): Promise<User> {
  const users = userMemory.getUsers();

  if (selectedRole === 'owner') {
    const normalizedEmail = normalizeEmail(loginKey);
    let foundOwner =
      users.find(
        (u) =>
          u.role === 'owner' &&
          u.status === 'active' &&
          emailsMatch(u.email, normalizedEmail)
      ) || null;

    if (!foundOwner && DEMO_MODE) {
      const demoUser = DEMO_USERS.find(
        (d) => d.role === 'owner' && emailsMatch(d.email, normalizedEmail)
      );
      if (demoUser) {
        foundOwner = userMemory.getUsers().find((u) => u.id === demoUser.id) || null;
        if (!foundOwner) {
          foundOwner = { ...demoUser };
          await userMemory.addUser(foundOwner);
        }
      }
    }

    if (!foundOwner) {
      throw new Error(t('alerts.auth.emailNotFound'));
    }

    return foundOwner;
  }

  const cleanPhone = loginKey.replace(/[^0-9]/g, '');
  let foundUser = users.find((u) => u.phone === cleanPhone && u.status === 'active') || null;

  if (foundUser && foundUser.role !== selectedRole) {
    throw new Error(t('alerts.auth.wrongRole', { role: roleLabel(foundUser.role) }));
  }

  if (!foundUser && selectedRole !== 'owner') {
    const pending = userMemory.getPendingEmployees();
    let pendingUser = pending.find((u) => u.phone === cleanPhone);

    if (!pendingUser && (await hasSupabaseSession())) {
      const remoteInvitation = await fetchInvitationByPhone(cleanPhone);
      if (remoteInvitation?.status === 'pending') {
        pendingUser = {
          id: generateSecureId('pending'),
          name: remoteInvitation.name,
          email: `${cleanPhone}@users.pvzpersonal.ru`,
          phone: cleanPhone,
          role: remoteInvitation.role,
          status: 'pending',
          pvzId: remoteInvitation.pvzId,
          createdAt: remoteInvitation.createdAt,
          invitedBy: remoteInvitation.invitedBy,
          passwordHash: '',
        };

        const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
        const allInvitations = safeParseJson<
          Array<{ id: string; pvzName?: string; [key: string]: unknown }>
        >(allInvitationsRaw ?? '[]', []);
        const exists = allInvitations.some((inv) => inv.id === remoteInvitation.id);
        if (!exists) {
          allInvitations.push({ ...remoteInvitation, pvzName: 'ПВЗ' });
          await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
        }
      }
    }

    if (pendingUser) {
      const allInvitationsRaw = await SecureStore.getItemAsync('all_invitations');
      const allInvitations = safeParseJson<
        Array<{ id: string; status: string; phone: string; pvzId?: string; role?: string; name?: string; invitedBy?: string }>
      >(allInvitationsRaw ?? '[]', []);

      let invitation = options?.invitationId
        ? allInvitations.find((inv) => inv.id === options.invitationId && inv.status === 'pending')
        : undefined;

      if (!invitation) {
        invitation = allInvitations.find(
          (inv) =>
            inv.phone.replace(/[^0-9]/g, '') === cleanPhone &&
            inv.status === 'pending' &&
            (!options?.pvzId || inv.pvzId === options.pvzId) &&
            (!inv.role || inv.role === selectedRole)
        );
      }

      if (!invitation) {
        throw new Error(t('alerts.auth.invitationRevoked'));
      }

      const inviteRole: UserRole = invitation.role === 'admin' ? 'admin' : 'employee';
      if (inviteRole !== selectedRole) {
        throw new Error(t('alerts.auth.invitationWrongRole', { role: roleLabel(inviteRole) }));
      }

      foundUser = {
        ...pendingUser,
        status: 'active',
        name: invitation.name || pendingUser.name,
        role: inviteRole,
        pvzId: invitation.pvzId || pendingUser.pvzId,
        permissionLevel:
          inviteRole === 'admin' ? pendingUser.permissionLevel || 'full' : pendingUser.permissionLevel,
        pvzIds: inviteRole === 'admin' ? pendingUser.pvzIds || [invitation.pvzId!] : pendingUser.pvzIds,
      };

      await userMemory.addUser(foundUser);
      await userMemory.removePendingByPhone(cleanPhone);

      invitation.status = 'accepted';
      await SecureStore.setItemAsync('all_invitations', JSON.stringify(allInvitations));
      await updateInvitationStatusInSupabase(invitation.id, 'accepted');

      if (invitation.invitedBy) {
        const ownerInvitationsRaw = await SecureStore.getItemAsync(`invitations_${invitation.invitedBy}`);
        const ownerInvitations = safeParseJson<Array<{ id: string; status: string }>>(
          ownerInvitationsRaw ?? '[]',
          []
        );
        const ownerIndex = ownerInvitations.findIndex((inv) => inv.id === invitation!.id);
        if (ownerIndex !== -1) {
          ownerInvitations[ownerIndex].status = 'accepted';
          await SecureStore.setItemAsync(
            `invitations_${invitation.invitedBy}`,
            JSON.stringify(ownerInvitations)
          );
        }
      }
    } else {
      throw new Error(t('alerts.auth.phoneNotFound'));
    }
  }

  if (!foundUser) {
    throw new Error(t('alerts.auth.phoneNotFound'));
  }

  return foundUser;
}
