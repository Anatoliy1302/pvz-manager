import * as SecureStore from 'expo-secure-store';
import { User } from '../../types/user';
import { DEMO_MODE } from '../../services/SupabaseAuthService';
import { DEMO_PVZ, DEMO_USERS } from './demoData';
import { safeParseJson } from '../../utils/safeJson';
import DataService from '../../services/DataService';

export const MAX_EMPLOYEES_PER_PVZ = 50;

type StoreListener = () => void;

class UserMemoryStore {
  private users: User[] = [];
  private pending: User[] = [];
  private listeners = new Set<StoreListener>();

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
    DataService.emitChange('pvz_users');
    DataService.emitChange('pending_employees');
  }

  getUsers(): User[] {
    return this.users;
  }

  getPendingEmployees(): User[] {
    return this.pending;
  }

  setUsers(next: User[]): void {
    this.users = next;
  }

  setPending(next: User[]): void {
    this.pending = next;
  }

  async persistUsers(): Promise<void> {
    await SecureStore.setItemAsync('pvz_users', JSON.stringify(this.users));
    this.notify();
  }

  async persistPending(): Promise<void> {
    await SecureStore.setItemAsync('pending_employees', JSON.stringify(this.pending));
    this.notify();
  }

  async addUser(user: User): Promise<void> {
    this.users = [...this.users, user];
    await this.persistUsers();
  }

  async addPending(user: User): Promise<void> {
    this.pending = [...this.pending, user];
    await this.persistPending();
  }

  async removePendingByIndex(index: number): Promise<User | undefined> {
    if (index < 0 || index >= this.pending.length) return undefined;
    const removed = this.pending[index];
    this.pending = this.pending.filter((_, i) => i !== index);
    await this.persistPending();
    return removed;
  }

  async removePendingByPhone(phone: string): Promise<void> {
    const next = this.pending.filter((u) => u.phone !== phone);
    if (next.length === this.pending.length) return;
    this.pending = next;
    await this.persistPending();
  }

  async replaceUserId(oldId: string, newId: string): Promise<void> {
    const index = this.users.findIndex((u) => u.id === oldId);
    if (index === -1) return;
    const updated = [...this.users];
    updated[index] = { ...updated[index], id: newId };
    this.users = updated;
    await this.persistUsers();
  }

  async updateUser(userId: string, patch: Partial<User>): Promise<void> {
    const index = this.users.findIndex((u) => u.id === userId);
    if (index === -1) return;
    const updated = [...this.users];
    updated[index] = { ...updated[index], ...patch };
    this.users = updated;
    await this.persistUsers();
  }

  async updatePending(userId: string, patch: Partial<User>): Promise<void> {
    const index = this.pending.findIndex((u) => u.id === userId);
    if (index === -1) return;
    const updated = [...this.pending];
    updated[index] = { ...updated[index], ...patch };
    this.pending = updated;
    await this.persistPending();
  }

  async activatePendingAt(index: number, activeUser: User): Promise<void> {
    if (index < 0 || index >= this.pending.length) return;
    const nextPending = [...this.pending];
    nextPending.splice(index, 1);
    this.pending = nextPending;
    this.users = [...this.users, activeUser];
    await SecureStore.setItemAsync('pvz_users', JSON.stringify(this.users));
    await SecureStore.setItemAsync('pending_employees', JSON.stringify(this.pending));
    this.notify();
  }
}

export const userMemory = new UserMemoryStore();

/** @deprecated Используйте userMemory.getUsers() */
export const getUsersStore = (): User[] => userMemory.getUsers();

/** @deprecated Используйте userMemory.getPendingEmployees() */
export const getPendingStore = (): User[] => userMemory.getPendingEmployees();

export const subscribeUsersStore = (listener: StoreListener): (() => void) =>
  userMemory.subscribe(listener);

export const loadUsersFromStorage = async (): Promise<void> => {
  try {
    const stored = await SecureStore.getItemAsync('pvz_users');
    if (stored) {
      userMemory.setUsers(safeParseJson<User[]>(stored, []));
    } else if (DEMO_MODE) {
      userMemory.setUsers(DEMO_USERS);
      await SecureStore.setItemAsync('pvz_users', JSON.stringify(DEMO_USERS));
      await SecureStore.setItemAsync('pvz_list', JSON.stringify(DEMO_PVZ));
    } else {
      userMemory.setUsers([]);
    }
  } catch (error) {
    console.error('Ошибка загрузки пользователей:', error);
  }
};

export const loadPendingEmployeesFromStorage = async (): Promise<void> => {
  try {
    const stored = await SecureStore.getItemAsync('pending_employees');
    if (stored) {
      userMemory.setPending(safeParseJson<User[]>(stored, []));
    } else {
      userMemory.setPending([]);
      await SecureStore.setItemAsync('pending_employees', JSON.stringify([]));
    }
  } catch (error) {
    console.error('Ошибка загрузки ожидающих сотрудников:', error);
  }
};

export const saveUsersToStorage = async (): Promise<void> => {
  await userMemory.persistUsers();
};

export const savePendingEmployeesToStorage = async (): Promise<void> => {
  await userMemory.persistPending();
};

export const resetUserMemoryStore = (): void => {
  userMemory.setUsers([]);
  userMemory.setPending([]);
};

export const refreshPendingEmployees = async (): Promise<void> => {
  try {
    const stored = await SecureStore.getItemAsync('pending_employees');
    if (stored) {
      userMemory.setPending(safeParseJson<User[]>(stored, []));
    }
  } catch (error) {
    console.error('Ошибка обновления ожидающих сотрудников:', error);
  }
};
