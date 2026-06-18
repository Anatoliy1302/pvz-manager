import { supabase } from '../../lib/supabase';
import { hasSupabaseSession } from './SupabaseAuthService';
import type { AnalyticsEventName } from './analytics/events';

type EventPayload = Record<string, unknown>;

interface QueuedEvent {
  eventName: AnalyticsEventName | string;
  eventData?: EventPayload;
  screen?: string;
}

class AnalyticsService {
  private currentScreen: string | undefined;
  private queue: QueuedEvent[] = [];
  private flushInFlight = false;

  setCurrentScreen(screen: string | undefined): void {
    this.currentScreen = screen;
  }

  getCurrentScreen(): string | undefined {
    return this.currentScreen;
  }

  /** Fire-and-forget: ошибки не показываем пользователю. */
  track(eventName: AnalyticsEventName | string, eventData?: EventPayload): void {
    void this.trackAsync(eventName, eventData);
  }

  async trackAsync(eventName: AnalyticsEventName | string, eventData?: EventPayload): Promise<void> {
    this.queue.push({
      eventName,
      eventData,
      screen: this.currentScreen,
    });
    await this.flushQueue();
  }

  private async flushQueue(): Promise<void> {
    if (this.flushInFlight || this.queue.length === 0) return;
    if (!(await hasSupabaseSession())) return;

    this.flushInFlight = true;
    const batch = this.queue.splice(0, this.queue.length);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const rows = batch.map((item) => ({
        user_id: user?.id ?? null,
        event_name: item.eventName,
        event_data: item.eventData ?? null,
        screen: item.screen ?? this.currentScreen ?? null,
      }));

      const { error } = await supabase.from('analytics_events').insert(rows);
      if (error && __DEV__) {
        console.warn('[Analytics] insert failed:', error.message);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[Analytics] flush failed:', error);
      }
      this.queue.unshift(...batch);
    } finally {
      this.flushInFlight = false;
    }
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
