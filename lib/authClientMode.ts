import { Platform } from 'react-native';

/** На RN auth-js (setSession/refresh) даёт таймауты — JWT из SecureStore + REST. */
export function useStorageOnlyAuthClient(): boolean {
  return Platform.OS !== 'web';
}
