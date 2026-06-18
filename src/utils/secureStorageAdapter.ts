import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  decryptAuthPayload,
  encryptAuthPayload,
  isEncryptedAuthPayload,
} from './authStorageCrypto';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const SUPABASE_AUTH_KEY_PREFIX = 'sb-';
const ASYNC_OVERFLOW_SUFFIX = '__async_overflow';

function isSupabaseAuthStorageKey(key: string): boolean {
  return key.startsWith(SUPABASE_AUTH_KEY_PREFIX) || key.includes('supabase.auth');
}

function isAsyncOverflowKey(key: string): boolean {
  return key.endsWith(ASYNC_OVERFLOW_SUFFIX);
}

async function clearAsyncOverflow(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  await AsyncStorage.removeItem(`${key}${ASYNC_OVERFLOW_SUFFIX}`);
}

/** Удалить устаревшую копию сессии из Keychain (JWT >2048 байт там не хранится). */
async function purgeLegacySecureStoreAuthKey(key: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(key, SECURE_OPTIONS).catch(() => undefined);
}

async function readStoredValue(key: string): Promise<string | null> {
  const stored = await AsyncStorage.getItem(key);
  if (!stored) return null;

  if (Platform.OS === 'web' || !isEncryptedAuthPayload(stored)) {
    return stored;
  }

  const decrypted = await decryptAuthPayload(stored);
  if (!decrypted) {
    if (__DEV__) {
      console.warn('[AuthStorage] Не удалось расшифровать сессию');
    }
    return null;
  }
  return decrypted;
}

async function writeStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }

  const encrypted = await encryptAuthPayload(value);
  await AsyncStorage.setItem(key, encrypted);
}

/**
 * Хранилище Supabase Auth.
 * JWT-сессия шифруется AES-256-GCM; ключ шифрования — в SecureStore, payload — в AsyncStorage.
 */
export const secureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (isAsyncOverflowKey(key)) {
      return null;
    }

    try {
      return await readStoredValue(key);
    } catch (error) {
      console.error(`[AuthStorage] Ошибка чтения ${key}:`, error);
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await writeStoredValue(key, value);
      await purgeLegacySecureStoreAuthKey(key);
      await clearAsyncOverflow(key);
    } catch (error) {
      console.error(`[AuthStorage] Ошибка записи ${key}:`, error);
      throw new Error('Не удалось сохранить данные сессии');
    }
  },

  removeItem: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(key);
    await clearAsyncOverflow(key);
    await purgeLegacySecureStoreAuthKey(key);
  },
};

/** Миграция: шифрование plaintext-сессий и очистка legacy-ключей. */
export async function migrateSupabaseAuthFromAsyncStorage(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const authKeys = allKeys.filter(
      (k) => !isAsyncOverflowKey(k) && isSupabaseAuthStorageKey(k)
    );

    for (const key of authKeys) {
      await purgeLegacySecureStoreAuthKey(key);

      const marker = await AsyncStorage.getItem(`${key}${ASYNC_OVERFLOW_SUFFIX}`);
      if (marker === '1') {
        await AsyncStorage.removeItem(`${key}${ASYNC_OVERFLOW_SUFFIX}`);
      }

      const raw = await AsyncStorage.getItem(key);
      if (raw && !isEncryptedAuthPayload(raw)) {
        await writeStoredValue(key, raw);
      }
    }
  } catch (error) {
    console.error('[AuthStorage] Ошибка миграции:', error);
  }
}

/** Удаляет зашифрованную Supabase Auth-сессию из AsyncStorage / SecureStore. */
export async function clearSupabaseAuthStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    for (const key of allKeys) {
      if (isAsyncOverflowKey(key)) {
        await AsyncStorage.removeItem(key);
        continue;
      }
      if (isSupabaseAuthStorageKey(key)) {
        await secureStorageAdapter.removeItem(key);
      }
    }
  } catch (error) {
    console.error('[AuthStorage] Ошибка очистки auth storage:', error);
  }
}
