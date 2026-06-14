import * as SecureStore from 'expo-secure-store';
import { Pvz } from '../../types/user';
import { safeParseJson } from '../../utils/safeJson';

export async function readLocalPvzs(): Promise<Pvz[]> {
  const stored = await SecureStore.getItemAsync('pvz_list');
  return safeParseJson<Pvz[]>(stored ?? '[]', []);
}

export async function writeLocalPvzs(pvzs: Pvz[]): Promise<void> {
  await SecureStore.setItemAsync('pvz_list', JSON.stringify(pvzs));
}
