import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Префикс ключей Supabase Auth в AsyncStorage (до миграции). */
const SUPABASE_AUTH_KEY_PREFIX = 'sb-';

/**
 * Адаптер хранилища для Supabase Auth.
 * На native — только SecureStore (без fallback на AsyncStorage).
 * На web — AsyncStorage.
 */
export const secureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }

    try {
      const value = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
      if (value !== null) {
        return value;
      }

      // Одноразовая миграция сессии из AsyncStorage → SecureStore
      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) {
        await SecureStore.setItemAsync(key, legacy, SECURE_OPTIONS);
        await AsyncStorage.removeItem(key);
        console.info(`[AuthStorage] Мигрирован ключ ${key} из AsyncStorage в SecureStore`);
        return legacy;
      }

      return null;
    } catch (error) {
      console.error(`[AuthStorage] Ошибка чтения ключа ${key}:`, error);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
      // Удаляем устаревшую копию из AsyncStorage, если была
      await AsyncStorage.removeItem(key).catch(() => undefined);
    } catch (error) {
      console.error(`[AuthStorage] Ошибка записи ключа ${key}:`, error);
      throw new Error('Не удалось сохранить данные сессии в защищённом хранилище');
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }

    try {
      await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
    } catch (error) {
      console.error(`[AuthStorage] Ошибка удаления ключа ${key}:`, error);
    }

    await AsyncStorage.removeItem(key).catch(() => undefined);
  },
};

/** Миграция всех ключей Supabase Auth из AsyncStorage в SecureStore при старте. */
export async function migrateSupabaseAuthFromAsyncStorage(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const authKeys = allKeys.filter(
      (k) => k.startsWith(SUPABASE_AUTH_KEY_PREFIX) || k.includes('supabase.auth')
    );

    for (const key of authKeys) {
      const legacy = await AsyncStorage.getItem(key);
      if (legacy === null) continue;

      const existing = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
      if (existing === null) {
        await SecureStore.setItemAsync(key, legacy, SECURE_OPTIONS);
        console.info(`[AuthStorage] Мигрирован ${key} → SecureStore`);
      }
      await AsyncStorage.removeItem(key);
    }
  } catch (error) {
    console.error('[AuthStorage] Ошибка миграции Supabase-сессии:', error);
  }
}
