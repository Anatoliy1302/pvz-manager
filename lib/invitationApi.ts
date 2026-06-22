import { getApiUrl } from '../config/api';
import { apiRequest } from './apiClient';
import { fetchWithRaceTimeout } from './fetchWithRaceTimeout';
import { cleanPhone } from '../src/utils/phoneHelpers';
import { isUuid } from '../src/utils/supabaseHelpers';

export interface ApiInvitation {
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

const TIMEOUT_MS = 30_000;

async function publicGet<T>(path: string): Promise<T> {
  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}${path}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    TIMEOUT_MS
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `API error: ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function checkPendingInvitationApi(
  phone: string,
  role: 'employee' | 'admin'
): Promise<boolean> {
  const normalized = cleanPhone(phone);
  const response = await fetchWithRaceTimeout(
    `${getApiUrl()}/api/invitations/check?phone=${encodeURIComponent(normalized)}&role=${encodeURIComponent(role)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    TIMEOUT_MS
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : null) ?? `API error: ${response.status}`;
    throw new Error(message);
  }
  return Boolean((body as { pending?: boolean }).pending);
}

export async function fetchInvitationsFromApi(): Promise<ApiInvitation[] | null> {
  try {
    return await apiRequest<ApiInvitation[]>('/api/invitations', { method: 'GET' });
  } catch {
    return null;
  }
}

export async function upsertInvitationToApi(
  invitation: ApiInvitation & { pvzName?: string }
): Promise<ApiInvitation | null> {
  try {
    if (invitation.status === 'expired' || invitation.status === 'accepted') {
      if (!isUuid(invitation.id)) {
        return null;
      }
      return await apiRequest<ApiInvitation>(`/api/invitations/${invitation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: invitation.status }),
      });
    }

    return await apiRequest<ApiInvitation>('/api/invitations', {
      method: 'POST',
      body: JSON.stringify({
        phone: cleanPhone(invitation.phone),
        name: invitation.name,
        role: invitation.role,
        pvzId: invitation.pvzId,
      }),
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('[InvitationApi] upsert failed:', error);
    }
    return null;
  }
}

export async function updateInvitationStatusInApi(
  id: string,
  status: ApiInvitation['status']
): Promise<void> {
  await apiRequest(`/api/invitations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchPendingInvitationsForLoginApi(
  phone: string,
  role: 'employee' | 'admin'
): Promise<ApiInvitation[]> {
  const normalized = cleanPhone(phone);
  const list = await apiRequest<ApiInvitation[]>(
    `/api/invitations/pending?role=${encodeURIComponent(role)}`,
    { method: 'GET' }
  );
  return list.filter(
    (inv) => cleanPhone(inv.phone) === normalized && inv.status === 'pending' && inv.role === role
  );
}

export async function acceptStaffInvitationApi(payload: {
  invitationId: string;
  name?: string;
  role?: 'employee' | 'admin';
  pvzId?: string;
}): Promise<void> {
  await apiRequest('/api/profiles/staff', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
