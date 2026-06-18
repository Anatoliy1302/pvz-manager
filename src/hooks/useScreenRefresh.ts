import { useCallback, useRef, useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { InteractionManager } from 'react-native';
import DataService from '../services/DataService';

export interface UseScreenRefreshOptions {
  /** DataService keys — подписка на emitChange */
  subscribeKeys?: string[];
  /** Отложить загрузку до завершения анимации перехода */
  deferUntilInteractions?: boolean;
  /** Debounce подписок (мс), чтобы не дёргать экран несколько раз подряд */
  subscribeDebounceMs?: number;
}

/**
 * Перезагрузка данных при focus + подписки на DataService.
 * Не блокирует UI скелетоном при возврате — только фоновое обновление.
 */
export function useScreenRefresh(
  load: () => void | Promise<void>,
  deps: readonly unknown[],
  options: UseScreenRefreshOptions = {}
): void {
  const {
    subscribeKeys = [],
    deferUntilInteractions = true,
    subscribeDebounceMs = 150,
  } = options;

  const loadRef = useRef(load);
  loadRef.current = load;

  const runLoad = useCallback(() => {
    const exec = () => {
      void loadRef.current();
    };

    if (!deferUntilInteractions) {
      exec();
      return undefined;
    }

    const task = InteractionManager.runAfterInteractions(exec);
    return () => task.cancel();
  }, [deferUntilInteractions]);

  useFocusEffect(
    useCallback(() => {
      let cancelTransition: (() => void) | undefined;
      cancelTransition = runLoad();

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedLoad = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void loadRef.current();
        }, subscribeDebounceMs);
      };

      const unsubs = subscribeKeys.map((key) => DataService.subscribe(key, debouncedLoad));

      return () => {
        cancelTransition?.();
        if (debounceTimer) clearTimeout(debounceTimer);
        unsubs.forEach((unsub) => unsub());
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- deps passed explicitly by caller
    }, deps)
  );
}

/**
 * Скелетон только при первом открытии или смене scopeKey (pvzId и т.п.).
 */
export function useScopedInitialLoading(scopeKey: string | undefined): [boolean, () => void] {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [scopeKey]);

  const markLoaded = useCallback(() => {
    setLoading(false);
  }, []);

  return [loading, markLoaded];
}
