type Listener = () => void;

class DataEventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(key: string, callback: Listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  subscribeToPermissions(employeeId: string, callback: Listener) {
    return this.subscribe(`user_permissions_${employeeId}`, callback);
  }

  notify(key: string) {
    this.listeners.get(key)?.forEach((callback) => callback());
  }

  emitChange(key: string) {
    this.notify(key);
  }

  clear() {
    this.listeners.clear();
  }
}

export const dataEventBus = new DataEventBus();
