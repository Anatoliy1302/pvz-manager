import * as SecureStore from 'expo-secure-store';
import { User } from '../../types/user';
import { safeParseJson } from '../../utils/safeJson';
import { queueSnapshotPatch } from '../../../lib/syncPersistence';

export async function readLocalUsers(): Promise<User[]> {
  const stored = await SecureStore.getItemAsync('pvz_users');
  return safeParseJson<User[]>(stored ?? '[]', []);
}

export async function writeLocalUsers(users: User[]): Promise<void> {
  await SecureStore.setItemAsync('pvz_users', JSON.stringify(users));
  queueSnapshotPatch({ profiles: users });
}
