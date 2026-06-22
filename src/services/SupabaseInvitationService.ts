import {
  checkPendingInvitationApi,
  fetchInvitationsFromApi,
  upsertInvitationToApi,
  updateInvitationStatusInApi,
  fetchPendingInvitationsForLoginApi,
  type ApiInvitation,
} from '../../lib/invitationApi';
import { mergeById, normalizePhone } from '../utils/supabaseHelpers';
import { hasStoredAuthTokens, getAuthAccessToken } from './SupabaseAuthService';

export interface SyncInvitation {
  id: string;
  phone: string;
  name: string;
  role: 'employee' | 'admin';
  pvzId: string;
  pvzName?: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  invitedBy: string;
  invitedByName?: string;
}

function toSyncInvitation(row: ApiInvitation): SyncInvitation {
  return {
    id: row.id,
    phone: normalizePhone(row.phone),
    name: row.name,
    role: row.role,
    pvzId: row.pvzId,
    pvzName: row.pvzName,
    status: row.status,
    createdAt: row.createdAt,
    invitedBy: row.invitedBy,
    invitedByName: row.invitedByName,
  };
}

/** Проверка pending-приглашения до отправки SMS. */
export async function checkPendingInvitationForPhone(
  phone: string,
  role: SyncInvitation['role']
): Promise<boolean> {
  const cleanPhone = normalizePhone(phone);
  if (cleanPhone.length !== 11) return false;
  return checkPendingInvitationApi(cleanPhone, role);
}

export async function hasPendingEmployeeInvite(
  phone: string,
  role: SyncInvitation['role']
): Promise<boolean> {
  return checkPendingInvitationForPhone(phone, role);
}

export async function fetchInvitationsFromSupabase(): Promise<SyncInvitation[] | null> {
  if (!(await getAuthAccessToken()) && !(await hasStoredAuthTokens())) return null;
  const remote = await fetchInvitationsFromApi();
  if (!remote) return null;
  return remote.map(toSyncInvitation);
}

export async function fetchInvitationByPhone(
  phone: string,
  role?: SyncInvitation['role']
): Promise<SyncInvitation | null> {
  if (role) {
    return fetchPendingInvitationForLogin(phone, role);
  }
  const cleanPhone = normalizePhone(phone);
  const remote = await fetchInvitationsFromApi();
  if (!remote) return null;
  const match = remote.find(
    (inv) => normalizePhone(inv.phone) === cleanPhone && inv.status === 'pending'
  );
  return match ? toSyncInvitation(match) : null;
}

export async function fetchPendingInvitationForLogin(
  phone: string,
  role: SyncInvitation['role']
): Promise<SyncInvitation | null> {
  const cleanPhone = normalizePhone(phone);
  if (!(await getAuthAccessToken()) && !(await hasStoredAuthTokens())) return null;
  const list = await fetchPendingInvitationsForLoginApi(cleanPhone, role);
  const match = list.find((inv) => inv.role === role && inv.status === 'pending');
  return match ? toSyncInvitation(match) : null;
}

export async function upsertInvitationToSupabase(
  invitation: SyncInvitation
): Promise<SyncInvitation | null> {
  if (!(await getAuthAccessToken()) && !(await hasStoredAuthTokens())) return null;
  const synced = await upsertInvitationToApi(invitation);
  return synced ? toSyncInvitation(synced) : null;
}

export async function updateInvitationStatusInSupabase(
  id: string,
  status: SyncInvitation['status']
): Promise<boolean> {
  if (!(await hasStoredAuthTokens())) return false;
  try {
    await updateInvitationStatusInApi(id, status);
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('updateInvitationStatusInSupabase:', error);
    }
    return false;
  }
}

export function mergeInvitations(
  local: SyncInvitation[],
  remote: SyncInvitation[]
): SyncInvitation[] {
  return mergeById(local, remote);
}
