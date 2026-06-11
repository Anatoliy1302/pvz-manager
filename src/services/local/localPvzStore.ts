import * as SecureStore from 'expo-secure-store';
import { Pvz } from '../../types/user';

export async function readLocalPvzs(): Promise<Pvz[]> {
  const stored = await SecureStore.getItemAsync('pvz_list');
  return stored ? JSON.parse(stored) : [];
}

export async function writeLocalPvzs(pvzs: Pvz[]): Promise<void> {
  await SecureStore.setItemAsync('pvz_list', JSON.stringify(pvzs));
}
