import { User } from '../types/user';
import DataService from './DataService';
import { hasStoredAccessToken } from '../../lib/authSessionStore';

const channels: Array<{ unsubscribe?: () => void }> = [];
const loginChannels: Array<{ unsubscribe?: () => void }> = [];

async function getPvzIdsForUser(user: User): Promise<string[]> {
  if (user.role === 'owner') {
    const pvzs = await DataService.getPvzsByOwner(user.id);
    return pvzs.map((pvz) => pvz.id);
  }

  if (user.role === 'admin') {
    const pvzs = await DataService.getPvzsForAdmin(user);
    return pvzs.map((pvz) => pvz.id);
  }

  if (user.pvzId) {
    return [user.pvzId];
  }

  return [];
}

export function stopLoginSupabaseRealtime(): void {
  loginChannels.length = 0;
}

/** Realtime на экране входа — заменён pull-синхронизацией через VPS API. */
export async function startLoginSupabaseRealtime(): Promise<void> {
  stopLoginSupabaseRealtime();
  if (!(await hasStoredAccessToken())) {
    return;
  }
}

export function stopSupabaseRealtime(): void {
  stopLoginSupabaseRealtime();
  channels.length = 0;
}

export async function startSupabaseRealtime(user: User): Promise<void> {
  stopSupabaseRealtime();
  if (!(await hasStoredAccessToken())) {
    return;
  }

  const pvzIds = await getPvzIdsForUser(user);
  if (pvzIds.length === 0) {
    return;
  }
}
