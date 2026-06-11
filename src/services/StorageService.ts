import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

class StorageServiceClass {
  /**
   * Сохранение данных
   * Сначала пробует SecureStore, если недоступен - использует AsyncStorage
   */
  async saveData(key: string, value: string): Promise<void> {
    try {
      // Пробуем сохранить в SecureStore
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync(key, value);
        console.log(`✅ Данные сохранены в SecureStore: ${key}`);
      } else {
        // Для web используем AsyncStorage
        await AsyncStorage.setItem(key, value);
        console.log(`✅ Данные сохранены в AsyncStorage: ${key}`);
      }
    } catch (error) {
      // Если SecureStore недоступен, сохраняем в AsyncStorage
      console.warn(`⚠️ SecureStore недоступен для ключа ${key}, сохраняем в AsyncStorage:`, error);
      try {
        await AsyncStorage.setItem(key, value);
        console.log(`✅ Данные сохранены в AsyncStorage (резерв): ${key}`);
      } catch (asyncError) {
        console.error(`❌ Ошибка сохранения данных ${key}:`, asyncError);
        throw asyncError;
      }
    }
  }

  /**
   * Получение данных
   * Сначала пробует SecureStore, если нет - AsyncStorage
   */
  async getData(key: string): Promise<string | null> {
    try {
      // Пробуем получить из SecureStore
      if (Platform.OS !== 'web') {
        const value = await SecureStore.getItemAsync(key);
        if (value !== null) {
          console.log(`✅ Данные получены из SecureStore: ${key}`);
          return value;
        }
      }
      
      // Если в SecureStore нет или это web, пробуем AsyncStorage
      const asyncValue = await AsyncStorage.getItem(key);
      if (asyncValue !== null) {
        console.log(`✅ Данные получены из AsyncStorage: ${key}`);
        return asyncValue;
      }
      
      console.log(`ℹ️ Данные не найдены: ${key}`);
      return null;
    } catch (error) {
      // Если SecureStore выдал ошибку, пробуем AsyncStorage
      console.warn(`⚠️ Ошибка SecureStore для ключа ${key}, читаем из AsyncStorage:`, error);
      try {
        const asyncValue = await AsyncStorage.getItem(key);
        if (asyncValue !== null) {
          console.log(`✅ Данные получены из AsyncStorage (резерв): ${key}`);
          return asyncValue;
        }
        return null;
      } catch (asyncError) {
        console.error(`❌ Ошибка чтения данных ${key}:`, asyncError);
        return null;
      }
    }
  }

  /**
   * Удаление данных
   */
  async removeData(key: string): Promise<void> {
    try {
      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync(key);
        console.log(`✅ Данные удалены из SecureStore: ${key}`);
      }
      
      await AsyncStorage.removeItem(key);
      console.log(`✅ Данные удалены из AsyncStorage: ${key}`);
    } catch (error) {
      console.warn(`⚠️ Ошибка удаления SecureStore для ключа ${key}:`, error);
      try {
        await AsyncStorage.removeItem(key);
        console.log(`✅ Данные удалены из AsyncStorage (резерв): ${key}`);
      } catch (asyncError) {
        console.error(`❌ Ошибка удаления данных ${key}:`, asyncError);
      }
    }
  }

  /**
   * Проверка существования ключа
   */
  async hasKey(key: string): Promise<boolean> {
    try {
      const value = await this.getData(key);
      return value !== null;
    } catch (error) {
      console.error(`❌ Ошибка проверки ключа ${key}:`, error);
      return false;
    }
  }

  /**
   * Получение всех ключей (только из AsyncStorage)
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return [...keys];
    } catch (error) {
      console.error('❌ Ошибка получения всех ключей:', error);
      return [];
    }
  }

  /**
   * Очистка всех данных приложения
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await this.getAllKeys();
      
      // Удаляем из SecureStore
      if (Platform.OS !== 'web') {
        for (const key of keys) {
          try {
            await SecureStore.deleteItemAsync(key);
          } catch (e) {
            // Игнорируем ошибки SecureStore
          }
        }
      }
      
      // Удаляем из AsyncStorage
      await AsyncStorage.clear();
      
      console.log('✅ Все данные приложения очищены');
    } catch (error) {
      console.error('❌ Ошибка очистки данных:', error);
    }
  }

  /**
   * Сохранение объекта (JSON)
   */
  async saveObject(key: string, value: object): Promise<void> {
    try {
      const jsonValue = JSON.stringify(value);
      await this.saveData(key, jsonValue);
    } catch (error) {
      console.error(`❌ Ошибка сохранения объекта ${key}:`, error);
      throw error;
    }
  }

  /**
   * Получение объекта (JSON)
   */
  async getObject<T = any>(key: string): Promise<T | null> {
    try {
      const jsonValue = await this.getData(key);
      if (jsonValue === null) {
        return null;
      }
      return JSON.parse(jsonValue) as T;
    } catch (error) {
      console.error(`❌ Ошибка чтения объекта ${key}:`, error);
      return null;
    }
  }

  /**
   * Сохранение числа
   */
  async saveNumber(key: string, value: number): Promise<void> {
    await this.saveData(key, value.toString());
  }

  /**
   * Получение числа
   */
  async getNumber(key: string): Promise<number | null> {
    const value = await this.getData(key);
    if (value === null) return null;
    const num = Number(value);
    return isNaN(num) ? null : num;
  }

  /**
   * Сохранение булевого значения
   */
  async saveBoolean(key: string, value: boolean): Promise<void> {
    await this.saveData(key, value ? 'true' : 'false');
  }

  /**
   * Получение булевого значения
   */
  async getBoolean(key: string): Promise<boolean | null> {
    const value = await this.getData(key);
    if (value === null) return null;
    return value === 'true';
  }

  /**
   * Сохранение массива
   */
  async saveArray(key: string, value: any[]): Promise<void> {
    await this.saveObject(key, value);
  }

  /**
   * Получение массива
   */
  async getArray<T = any>(key: string): Promise<T[]> {
    const value = await this.getObject<T[]>(key);
    return value || [];
  }

  /**
   * Миграция данных из SecureStore в AsyncStorage и обратно
   */
  async migrateKey(key: string, from: 'secure' | 'async' = 'async'): Promise<void> {
    try {
      let value: string | null = null;
      
      if (from === 'async') {
        // Миграция из AsyncStorage в SecureStore
        value = await AsyncStorage.getItem(key);
        if (value !== null && Platform.OS !== 'web') {
          await SecureStore.setItemAsync(key, value);
          console.log(`✅ Данные ${key} мигрированы из AsyncStorage в SecureStore`);
        }
      } else {
        // Миграция из SecureStore в AsyncStorage
        if (Platform.OS !== 'web') {
          value = await SecureStore.getItemAsync(key);
        }
        if (value !== null) {
          await AsyncStorage.setItem(key, value);
          console.log(`✅ Данные ${key} мигрированы из SecureStore в AsyncStorage`);
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка миграции ключа ${key}:`, error);
    }
  }

  /** Алиасы для совместимости с экранами и сервисами */
  async getItem(key: string): Promise<string | null> {
    return this.getData(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.saveData(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    await this.removeData(key);
  }

  /**
   * Проверка доступности SecureStore
   */
  async isSecureStoreAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    try {
      await SecureStore.setItemAsync('_test_', 'test');
      await SecureStore.deleteItemAsync('_test_');
      return true;
    } catch {
      return false;
    }
  }
}

// Экспортируем экземпляр класса
export const StorageService = new StorageServiceClass();
export default StorageService;

// Экспортируем типы для TypeScript
export type StorageServiceType = StorageServiceClass;
