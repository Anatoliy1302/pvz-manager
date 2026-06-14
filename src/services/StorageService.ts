import * as SecureStore from 'expo-secure-store';
import { safeParseJson } from '../utils/safeJson';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

class StorageDegradedError extends Error {
  constructor(key: string, cause: unknown) {
    super(
      `SecureStore недоступен для ключа "${key}". Данные не сохранены в незащищённое хранилище.`
    );
    this.name = 'StorageDegradedError';
    this.cause = cause;
  }
}

class StorageServiceClass {
  private degradedLogged = false;

  private logDegraded(key: string, error: unknown): never {
    if (!this.degradedLogged) {
      this.degradedLogged = true;
      console.error(
        `[StorageService] КРИТИЧНО: SecureStore недоступен. Fallback на AsyncStorage отключён для безопасности.`,
        error
      );
    }
    throw new StorageDegradedError(key, error);
  }

  /**
   * Сохранение данных.
   * Native: только SecureStore (без fallback).
   * Web: AsyncStorage.
   */
  async saveData(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }

    try {
      await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
    } catch (error) {
      this.logDegraded(key, error);
    }
  }

  /**
   * Получение данных.
   * Native: SecureStore, затем одноразовое чтение legacy из AsyncStorage с миграцией.
   */
  async getData(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return AsyncStorage.getItem(key);
    }

    try {
      const value = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
      if (value !== null) {
        return value;
      }

      const legacy = await AsyncStorage.getItem(key);
      if (legacy !== null) {
        console.warn(
          `[StorageService] Legacy-данные для "${key}" найдены в AsyncStorage — мигрируем в SecureStore`
        );
        await SecureStore.setItemAsync(key, legacy, SECURE_OPTIONS);
        await AsyncStorage.removeItem(key);
        return legacy;
      }

      return null;
    } catch (error) {
      console.error(`[StorageService] Ошибка чтения ключа ${key}:`, error);
      return null;
    }
  }

  async removeData(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }

    try {
      await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
    } catch (error) {
      console.warn(`[StorageService] Ошибка удаления SecureStore для ключа ${key}:`, error);
    }

    await AsyncStorage.removeItem(key).catch(() => undefined);
  }

  async hasKey(key: string): Promise<boolean> {
    const value = await this.getData(key);
    return value !== null;
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return [...keys];
    } catch (error) {
      console.error('[StorageService] Ошибка получения всех ключей:', error);
      return [];
    }
  }

  async clearAll(): Promise<void> {
    try {
      const keys = await this.getAllKeys();

      if (Platform.OS !== 'web') {
        for (const key of keys) {
          try {
            await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
          } catch {
            // ignore per-key errors
          }
        }
      }

      await AsyncStorage.clear();
    } catch (error) {
      console.error('[StorageService] Ошибка очистки данных:', error);
    }
  }

  async saveObject(key: string, value: object): Promise<void> {
    await this.saveData(key, JSON.stringify(value));
  }

  async getObject<T = unknown>(key: string): Promise<T | null> {
    const jsonValue = await this.getData(key);
    if (jsonValue === null) return null;
    return safeParseJson<T | null>(jsonValue, null);
  }

  async saveNumber(key: string, value: number): Promise<void> {
    await this.saveData(key, value.toString());
  }

  async getNumber(key: string): Promise<number | null> {
    const value = await this.getData(key);
    if (value === null) return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }

  async saveBoolean(key: string, value: boolean): Promise<void> {
    await this.saveData(key, value ? 'true' : 'false');
  }

  async getBoolean(key: string): Promise<boolean | null> {
    const value = await this.getData(key);
    if (value === null) return null;
    return value === 'true';
  }

  async saveArray(key: string, value: unknown[]): Promise<void> {
    await this.saveObject(key, value);
  }

  async getArray<T = unknown>(key: string): Promise<T[]> {
    const value = await this.getObject<T[]>(key);
    return value ?? [];
  }

  async migrateKey(key: string, from: 'secure' | 'async' = 'async'): Promise<void> {
    if (Platform.OS === 'web') return;

    try {
      if (from === 'async') {
        const value = await AsyncStorage.getItem(key);
        if (value !== null) {
          await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
          await AsyncStorage.removeItem(key);
        }
      } else {
        const value = await SecureStore.getItemAsync(key, SECURE_OPTIONS);
        if (value !== null) {
          await AsyncStorage.setItem(key, value);
        }
      }
    } catch (error) {
      console.error(`[StorageService] Ошибка миграции ключа ${key}:`, error);
    }
  }

  async getItem(key: string): Promise<string | null> {
    return this.getData(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.saveData(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    await this.removeData(key);
  }

  async isSecureStoreAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      await SecureStore.setItemAsync('_test_', 'test', SECURE_OPTIONS);
      await SecureStore.deleteItemAsync('_test_', SECURE_OPTIONS);
      return true;
    } catch {
      return false;
    }
  }
}

export const StorageService = new StorageServiceClass();
export default StorageService;
export type StorageServiceType = StorageServiceClass;
export { StorageDegradedError };
