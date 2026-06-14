import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { changeAppLanguage } from '../i18n/loadLocale';
import i18n from '../i18n';
import {
  AppLanguage,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
} from '../i18n/types';

interface LanguageContextData {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextData>({} as LanguageContextData);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(
    (i18n.language as AppLanguage) || 'ru'
  );
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadLanguage = async () => {
      try {
        const stored = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
        if (cancelled) return;

        if (stored && SUPPORTED_LANGUAGES.includes(stored as AppLanguage)) {
          await changeAppLanguage(stored as AppLanguage);
          if (!cancelled) {
            setLanguageState(stored as AppLanguage);
          }
        }
      } catch (error) {
        console.error('Failed to load language preference:', error);
      }
    };

    void loadLanguage();

    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    await changeAppLanguage(next);
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, next);
    setLanguageState(next);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
