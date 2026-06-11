import * as SecureStore from 'expo-secure-store';
import { User } from '../../types/user';

export async function readLocalUsers(): Promise<User[]> {
  const stored = await SecureStore.getItemAsync('pvz_users');
  return stored ? JSON.parse(stored) : [];
}

export async function writeLocalUsers(users: User[]): Promise<void> {
  await SecureStore.setItemAsync('pvz_users', JSON.stringify(users));
}
