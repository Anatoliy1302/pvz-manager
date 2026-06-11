export interface SyncState {
  isSyncing: boolean;
  lastError: string | null;
  lastSyncedAt: string | null;
  errorCount: number;
}

type SyncListener = (state: SyncState) => void;

const initialState: SyncState = {
  isSyncing: false,
  lastError: null,
  lastSyncedAt: null,
  errorCount: 0,
};

class SyncStatusService {
  private state: SyncState = { ...initialState };
  private listeners = new Set<SyncListener>();

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  startSync(): void {
    this.state = { ...this.state, isSyncing: true, lastError: null };
    this.emit();
  }

  finishSync(errors: string[] = []): void {
    this.state = {
      isSyncing: false,
      lastError: errors.length > 0 ? errors[0] : null,
      lastSyncedAt: errors.length === 0 ? new Date().toISOString() : this.state.lastSyncedAt,
      errorCount: errors.length,
    };
    this.emit();
  }

  reportError(message: string): void {
    this.state = {
      ...this.state,
      lastError: message,
      errorCount: this.state.errorCount + 1,
    };
    this.emit();
  }

  clearError(): void {
    this.state = { ...this.state, lastError: null, errorCount: 0 };
    this.emit();
  }
}

export default new SyncStatusService();
