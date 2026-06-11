// src/hooks/useNotificationSettings.ts
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  parseNotificationSettings,
  serializeNotificationSettings,
} from '../utils/notificationSettingsHelpers';
import notificationService from '../services/NotificationService';

interface NotificationSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

interface UseNotificationSettingsReturn extends NotificationSettings {
  loading: boolean;
  setPushEnabled: (value: boolean) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setVibrationEnabled: (value: boolean) => Promise<void>;
  saveAllSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
}

/**
 * Хук для управления настройками уведомлений
 * 
 * @param settingsKey - ключ для хранения настроек в SecureStore
 * @returns объект с настройками и методами их обновления
 * 
 * @example
 * const { pushEnabled, soundEnabled, setPushEnabled } = useNotificationSettings('admin_notification_settings');
 */
export const useNotificationSettings = (settingsKey: string): UseNotificationSettingsReturn => {
  const [pushEnabled, setPushEnabledState] = useState(true);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [vibrationEnabled, setVibrationEnabledState] = useState(true);
  const [loading, setLoading] = useState(true);

  // Загрузка настроек
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await SecureStore.getItemAsync(settingsKey);
        if (stored) {
          const parsed = parseNotificationSettings(JSON.parse(stored));
          setPushEnabledState(parsed.pushEnabled);
          setSoundEnabledState(parsed.soundEnabled);
          setVibrationEnabledState(parsed.vibrationEnabled);
        }
      } catch (error) {
        console.error('Ошибка загрузки настроек уведомлений:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [settingsKey]);

  // Сохранение всех настроек
  const saveAllSettings = useCallback(async (settings: Partial<NotificationSettings>) => {
    try {
      const newSettings = {
        pushEnabled,
        soundEnabled,
        vibrationEnabled,
        ...settings,
      };
      await SecureStore.setItemAsync(settingsKey, serializeNotificationSettings(newSettings));
      await notificationService.applyUserPreferences();
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
    }
  }, [settingsKey, pushEnabled, soundEnabled, vibrationEnabled]);

  // Установка push-уведомлений
  const setPushEnabled = useCallback(async (value: boolean) => {
    setPushEnabledState(value);
    await saveAllSettings({ pushEnabled: value });
    
    // Если выключаем push, выключаем также звук и вибрацию
    if (!value) {
      setSoundEnabledState(false);
      setVibrationEnabledState(false);
      await saveAllSettings({ pushEnabled: value, soundEnabled: false, vibrationEnabled: false });
    }
  }, [saveAllSettings]);

  // Установка звука
  const setSoundEnabled = useCallback(async (value: boolean) => {
    setSoundEnabledState(value);
    await saveAllSettings({ soundEnabled: value });
  }, [saveAllSettings]);

  // Установка вибрации
  const setVibrationEnabled = useCallback(async (value: boolean) => {
    setVibrationEnabledState(value);
    await saveAllSettings({ vibrationEnabled: value });
  }, [saveAllSettings]);

  return {
    pushEnabled,
    soundEnabled,
    vibrationEnabled,
    loading,
    setPushEnabled,
    setSoundEnabled,
    setVibrationEnabled,
    saveAllSettings,
  };
};