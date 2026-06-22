import DataService from '../DataService';
import { User } from '../../types/user';
import { fetchProfileUser } from '../SupabaseAuthService';

export async function fetchProfile(userId: string): Promise<User | null> {
  const local = await DataService.getUserById(userId);
  try {
    const remote = await fetchProfileUser(userId);
    if (remote) return remote;
  } catch (error) {
    if (__DEV__ && !String(error).toLowerCase().includes('abort')) {
      console.warn('fetchProfile remote:', error);
    }
  }
  return local;
}
