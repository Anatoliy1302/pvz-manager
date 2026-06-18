import DataService from '../DataService';
import { User } from '../../types/user';
import { fetchProfileUser } from '../SupabaseAuthService';

export async function fetchProfile(userId: string): Promise<User | null> {
  try {
    const remote = await fetchProfileUser(userId);
    if (remote) return remote;
  } catch (error) {
    if (__DEV__) {
      console.warn('fetchProfile remote:', error);
    }
  }
  return DataService.getUserById(userId);
}
