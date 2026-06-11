import * as SecureStore from 'expo-secure-store';
import { User } from '../../types/user';
import { DEMO_PVZ, DEMO_USERS } from './demoData';

export const MAX_EMPLOYEES_PER_PVZ = 50;

export let USERS_STORE: User[] = [];
export let PENDING_EMPLOYEES: User[] = [];

export const loadUsersFromStorage = async () => {
  try {
    const stored = await SecureStore.getItemAsync('pvz_users');
    if (stored) {
      USERS_STORE = JSON.parse(stored);
      console.log(
        '📋 Загружены пользователи:',
        USERS_STORE.map((u) => ({ name: u.name, role: u.role, status: u.status, phone: u.phone }))
      );
    } else if (__DEV__) {
      USERS_STORE = DEMO_USERS;
      await SecureStore.setItemAsync('pvz_users', JSON.stringify(USERS_STORE));
      await SecureStore.setItemAsync('pvz_list', JSON.stringify(DEMO_PVZ));
      console.log('✅ Созданы демо-пользователи (__DEV__)');
    } else {
      USERS_STORE = [];
    }
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
  }
};

export const loadPendingEmployeesFromStorage = async () => {
  try {
    const stored = await SecureStore.getItemAsync('pending_employees');
    if (stored) {
      PENDING_EMPLOYEES = JSON.parse(stored);
      console.log(
        '📋 Загружены ожидающие сотрудники:',
        PENDING_EMPLOYEES.map((u) => ({ name: u.name, phone: u.phone }))
      );
    } else {
      PENDING_EMPLOYEES = [];
      await SecureStore.setItemAsync('pending_employees', JSON.stringify(PENDING_EMPLOYEES));
    }
  } catch (error) {
    console.error('Ошибка загрузки ожидающих сотрудников:', error);
  }
};

export const saveUsersToStorage = async () => {
  try {
    await SecureStore.setItemAsync('pvz_users', JSON.stringify(USERS_STORE));
  } catch (error) {
    console.error('Ошибка сохранения пользователей:', error);
  }
};

export const savePendingEmployeesToStorage = async () => {
  try {
    await SecureStore.setItemAsync('pending_employees', JSON.stringify(PENDING_EMPLOYEES));
  } catch (error) {
    console.error('Ошибка сохранения ожидающих сотрудников:', error);
  }
};

export const refreshPendingEmployees = async () => {
  try {
    const stored = await SecureStore.getItemAsync('pending_employees');
    if (stored) {
      PENDING_EMPLOYEES = JSON.parse(stored);
      console.log(
        '🔄 Обновлены ожидающие сотрудники:',
        PENDING_EMPLOYEES.map((u) => ({ name: u.name, phone: u.phone }))
      );
    }
  } catch (error) {
    console.error('Ошибка обновления ожидающих сотрудников:', error);
  }
};
