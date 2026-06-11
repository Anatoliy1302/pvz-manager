import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ActivityIndicator, View } from 'react-native';
import i18n, { changeAppLanguage } from '../i18n';
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.includes(stored as AppLanguage)) {
          await changeAppLanguage(stored as AppLanguage);
          setLanguageState(stored as AppLanguage);
        }
      } catch (error) {
        console.error('Failed to load language preference:', error);
      } finally {
        setReady(true);
      }
    };

    loadLanguage();
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    await changeAppLanguage(next);
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, next);
    setLanguageState(next);
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, ready }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
