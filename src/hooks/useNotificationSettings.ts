// src/hooks/useNotificationSettings.ts
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  parseNotificationSettings,
  serializeNotificationSettings,
  type NotificationTypeSettings,
} from '../utils/notificationSettingsHelpers';
import { safeParseJson } from '../utils/safeJson';
import notificationService from '../services/NotificationService';

interface NotificationSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  types: NotificationTypeSettings;
}

interface UseNotificationSettingsReturn extends NotificationSettings {
  loading: boolean;
  setPushEnabled: (value: boolean) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setVibrationEnabled: (value: boolean) => Promise<void>;
  setTypeEnabled: (type: keyof NotificationTypeSettings, value: boolean) => Promise<void>;
  saveAllSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
}

export const useNotificationSettings = (settingsKey: string): UseNotificationSettingsReturn => {
  const [pushEnabled, setPushEnabledState] = useState(true);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [vibrationEnabled, setVibrationEnabledState] = useState(true);
  const [types, setTypesState] = useState<NotificationTypeSettings>(
    DEFAULT_NOTIFICATION_SETTINGS.types
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await SecureStore.getItemAsync(settingsKey);
        if (stored) {
          const parsed = parseNotificationSettings(
            safeParseJson<Record<string, unknown>>(stored, {})
          );
          setPushEnabledState(parsed.pushEnabled);
          setSoundEnabledState(parsed.soundEnabled);
          setVibrationEnabledState(parsed.vibrationEnabled);
          setTypesState(parsed.types);
        }
      } catch (error) {
        console.error('Ошибка загрузки настроек уведомлений:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [settingsKey]);

  const persistSettings = useCallback(
    async (next: NotificationSettings) => {
      try {
        await SecureStore.setItemAsync(settingsKey, serializeNotificationSettings(next));
        await notificationService.applyUserPreferences();
      } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
      }
    },
    [settingsKey]
  );

  const saveAllSettings = useCallback(
    async (settings: Partial<NotificationSettings>) => {
      const next: NotificationSettings = {
        pushEnabled,
        soundEnabled,
        vibrationEnabled,
        types,
        ...settings,
      };

      setPushEnabledState(next.pushEnabled);
      setSoundEnabledState(next.soundEnabled);
      setVibrationEnabledState(next.vibrationEnabled);
      setTypesState(next.types);
      await persistSettings(next);
    },
    [pushEnabled, soundEnabled, vibrationEnabled, types, persistSettings]
  );

  const setPushEnabled = useCallback(
    async (value: boolean) => {
      const next: NotificationSettings = {
        pushEnabled: value,
        soundEnabled: value ? soundEnabled : false,
        vibrationEnabled: value ? vibrationEnabled : false,
        types,
      };
      await saveAllSettings(next);
    },
    [soundEnabled, vibrationEnabled, types, saveAllSettings]
  );

  const setSoundEnabled = useCallback(
    async (value: boolean) => {
      await saveAllSettings({ soundEnabled: value });
    },
    [saveAllSettings]
  );

  const setVibrationEnabled = useCallback(
    async (value: boolean) => {
      await saveAllSettings({ vibrationEnabled: value });
    },
    [saveAllSettings]
  );

  const setTypeEnabled = useCallback(
    async (type: keyof NotificationTypeSettings, value: boolean) => {
      await saveAllSettings({
        types: {
          ...types,
          [type]: value,
        },
      });
    },
    [types, saveAllSettings]
  );

  return {
    pushEnabled,
    soundEnabled,
    vibrationEnabled,
    types,
    loading,
    setPushEnabled,
    setSoundEnabled,
    setVibrationEnabled,
    setTypeEnabled,
    saveAllSettings,
  };
};
