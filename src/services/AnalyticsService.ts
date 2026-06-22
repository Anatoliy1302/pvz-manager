import {
  getCachedSessionUserId,
  hasStoredAuthTokens,
} from './SupabaseAuthService';
import { readSnapshotArray, writeSnapshotArray } from '../../lib/snapshotSync';
import type { AnalyticsEventName } from './analytics/events';

type EventPayload = Record<string, unknown>;

interface QueuedEvent {
  eventName: AnalyticsEventName | string;
  eventData?: EventPayload;
  screen?: string;
}

const FLUSH_DEBOUNCE_MS = 2_000;
const MAX_BATCH_SIZE = 20;

class AnalyticsService {
  private currentScreen: string | undefined;
  private queue: QueuedEvent[] = [];
  private flushScheduled = false;
  private flushInFlight = false;
  private authFlushPaused = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Пауза flush (OTP, холодный старт — меньше конкуренции за сеть). */
  setAuthFlushPaused(paused: boolean): void {
    this.authFlushPaused = paused;
    if (!paused && this.queue.length > 0) {
      this.scheduleFlush();
    }
  }

  setCurrentScreen(screen: string | undefined): void {
    this.currentScreen = screen;
  }

  getCurrentScreen(): string | undefined {
    return this.currentScreen;
  }

  /** Fire-and-forget: не блокирует UI, ошибки не показываем пользователю. */
  track(eventName: AnalyticsEventName | string, eventData?: EventPayload): void {
    this.queue.push({
      eventName,
      eventData,
      screen: this.currentScreen,
    });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.authFlushPaused || this.flushInFlight) return;
    if (this.debounceTimer) return;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.flushScheduled || this.authFlushPaused) return;
      this.flushScheduled = true;
      void this.flushQueue().finally(() => {
        this.flushScheduled = false;
        if (this.queue.length > 0) {
          this.scheduleFlush();
        }
      });
    }, FLUSH_DEBOUNCE_MS);
  }

  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0 || this.authFlushPaused || this.flushInFlight) return;
    if (!(await hasStoredAuthTokens())) {
      this.queue.length = 0;
      return;
    }

    this.flushInFlight = true;
    const batch = this.queue.splice(0, MAX_BATCH_SIZE);

    try {
      const ok = await this.sendBatch(batch);
      if (!ok) {
        this.queue.unshift(...batch);
      }
    } finally {
      this.flushInFlight = false;
    }
  }

  private async sendBatch(batch: QueuedEvent[]): Promise<boolean> {
    if (!(await hasStoredAuthTokens())) return false;

    const userId = getCachedSessionUserId();
    const rows = batch.map((item) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId ?? null,
      event_name: item.eventName,
      event_data: item.eventData ?? null,
      screen: item.screen ?? this.currentScreen ?? null,
      created_at: new Date().toISOString(),
    }));

    try {
      const existing = await readSnapshotArray<Record<string, unknown>>('analytics_events');
      await writeSnapshotArray('analytics_events', [...existing, ...rows].slice(-500));
      return true;
    } catch {
      return false;
    }
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
