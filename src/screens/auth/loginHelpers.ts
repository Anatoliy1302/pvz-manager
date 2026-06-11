import * as SecureStore from 'expo-secure-store';

export async function isPinSetupComplete(cleanedPhone: string): Promise<boolean> {
  const value = await SecureStore.getItemAsync(`user_setup_complete_${cleanedPhone}`);
  return value === 'true';
}
