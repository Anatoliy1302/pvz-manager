import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { cleanPhone } from '../utils/phoneHelpers';
import { isExpoGo } from '../utils/expoEnvironment';

/** Временно отключён вход по Face ID / Touch ID для всех пользователей. */
export const BIOMETRIC_LOGIN_ENABLED = false;

const biometricKey = (phone: string) => `biometric_enabled_${cleanPhone(phone)}`;

const disabledCapabilities = {
  available: false,
  enrolled: false,
  label: 'Биометрия',
  isFaceId: false,
  usesDeviceAuth: false,
} as const;

type AuthAttemptResult = LocalAuthentication.LocalAuthenticationResult;

export type BiometricAuthResult = {
  success: boolean;
  error?: LocalAuthentication.LocalAuthenticationError | 'unavailable' | 'missing_usage_description';
  message?: string;
  /** В Expo Go на iOS — подтверждение через код/Face ID iPhone для Expo Go, не отдельный Face ID приложения. */
  usesDeviceAuth?: boolean;
};

const BiometricService = {
  getDisplayLabel(types: LocalAuthentication.AuthenticationType[], isFaceId: boolean): string {
    if (isExpoGo && Platform.OS === 'ios') {
      return 'Подтверждение iPhone';
    }
    return BiometricService.getLabel(types);
  },

  /** Подтверждение код-паролем iPhone отключено (в т.ч. в Expo Go). */
  usesDeviceAuthOnThisBuild(): boolean {
    return false;
  },

  async getCapabilities(): Promise<{
    available: boolean;
    enrolled: boolean;
    label: string;
    isFaceId: boolean;
    usesDeviceAuth: boolean;
  }> {
    if (!BIOMETRIC_LOGIN_ENABLED || Platform.OS === 'web') {
      return { ...disabledCapabilities };
    }

    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) {
        return {
          available: false,
          enrolled: false,
          label: 'Биометрия',
          isFaceId: false,
          usesDeviceAuth: false,
        };
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const isFaceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const usesDeviceAuth = BiometricService.usesDeviceAuthOnThisBuild();

      const hasBiometricLevel =
        level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG ||
        level === LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK ||
        (usesDeviceAuth && enrolled);

      const label = BiometricService.getDisplayLabel(types, isFaceId);

      return {
        available: enrolled && (hasBiometricLevel || usesDeviceAuth),
        enrolled,
        label,
        isFaceId: isFaceId && !usesDeviceAuth,
        usesDeviceAuth,
      };
    } catch (error) {
      console.error('Ошибка проверки биометрии:', error);
      return {
        available: false,
        enrolled: false,
        label: 'Биометрия',
        isFaceId: false,
        usesDeviceAuth: false,
      };
    }
  },

  getLabel(types: LocalAuthentication.AuthenticationType[]): string {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Отпечаток пальца';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Сканирование радужки';
    }
    return 'Биометрия';
  },

  getErrorMessage(
    error: LocalAuthentication.LocalAuthenticationError | 'missing_usage_description',
    label: string,
    usesDeviceAuth: boolean
  ): string {
    if (error === 'missing_usage_description') {
      if (usesDeviceAuth || isExpoGo) {
        return 'Не удалось подтвердить через iPhone. Введите код-пароль устройства или войдите по PIN.';
      }
      return 'Face ID доступен только в установленной версии приложения. Соберите: npx expo run:ios';
    }

    switch (error) {
      case 'not_enrolled':
        return `${label} не настроен на устройстве. Добавьте его в настройках телефона.`;
      case 'not_available':
        return usesDeviceAuth
          ? 'Подтверждение iPhone недоступно. Войдите по PIN-коду.'
          : `${label} недоступен на этом устройстве.`;
      case 'passcode_not_set':
        return 'На устройстве не установлен код-пароль. Сначала настройте его в параметрах телефона.';
      case 'lockout':
        return 'Слишком много неудачных попыток. Подождите немного и повторите.';
      case 'authentication_failed':
        return 'Подтверждение не удалось. Повторите попытку.';
      case 'timeout':
        return 'Время ожидания истекло. Повторите попытку.';
      case 'unable_to_process':
        return 'Не удалось обработать запрос. Закройте другие окна и повторите.';
      case 'invalid_context':
        return 'Сейчас нельзя показать запрос. Повторите через секунду.';
      default:
        return `Не удалось подтвердить ${label}. Попробуйте ещё раз или войдите по PIN.`;
    }
  },

  async isEnabled(phone: string): Promise<boolean> {
    if (!BIOMETRIC_LOGIN_ENABLED) return false;
    const value = await SecureStore.getItemAsync(biometricKey(phone));
    return value === 'true';
  },

  async setEnabled(phone: string, enabled: boolean): Promise<void> {
    if (!BIOMETRIC_LOGIN_ENABLED) return;
    const key = biometricKey(phone);
    if (enabled) {
      await SecureStore.setItemAsync(key, 'true');
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },

  async runAuthenticateAttempt(iosBiometricsOnly: boolean, promptMessage: string): Promise<AuthAttemptResult> {
    return LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Отмена',
      disableDeviceFallback: Platform.OS === 'ios' ? iosBiometricsOnly : false,
      fallbackLabel: Platform.OS === 'ios' && iosBiometricsOnly ? '' : undefined,
      requireConfirmation: false,
      biometricsSecurityLevel: 'weak',
    });
  },

  parseAttemptResult(
    result: AuthAttemptResult,
    label: string,
    usesDeviceAuth: boolean
  ): BiometricAuthResult {
    if (result.success) {
      return { success: true, usesDeviceAuth };
    }

    const error = (result as { error?: string }).error;

    if (error === 'user_cancel' || error === 'system_cancel' || error === 'app_cancel') {
      return { success: false, error: 'user_cancel', usesDeviceAuth };
    }

    if (__DEV__) {
      console.warn('Биометрия: ошибка аутентификации:', error, result);
    }

    const mappedError = (error || 'authentication_failed') as
      | LocalAuthentication.LocalAuthenticationError
      | 'missing_usage_description';

    return {
      success: false,
      error: mappedError,
      message: BiometricService.getErrorMessage(mappedError, label, usesDeviceAuth),
      usesDeviceAuth,
    };
  },

  async authenticate(promptMessage: string): Promise<BiometricAuthResult> {
    const capabilities = await BiometricService.getCapabilities();
    if (!capabilities.available) {
      return {
        success: false,
        error: 'unavailable',
        message: `${capabilities.label} недоступен на этом устройстве.`,
        usesDeviceAuth: capabilities.usesDeviceAuth,
      };
    }

    const usesDeviceAuth = capabilities.usesDeviceAuth;

    try {
      // Expo Go на iOS: только системное подтверждение iPhone (код-пароль / Face ID системы для Expo Go).
      if (usesDeviceAuth) {
        const result = await BiometricService.runAuthenticateAttempt(false, promptMessage);
        return BiometricService.parseAttemptResult(result, capabilities.label, true);
      }

      // Собственная сборка на iOS: сначала чистый Face ID / Touch ID.
      if (Platform.OS === 'ios') {
        let result = await BiometricService.runAuthenticateAttempt(true, promptMessage);

        if (!result.success && (result as { error?: string }).error === 'missing_usage_description') {
          result = await BiometricService.runAuthenticateAttempt(false, promptMessage);
        }

        return BiometricService.parseAttemptResult(result, capabilities.label, false);
      }

      const result = await BiometricService.runAuthenticateAttempt(false, promptMessage);
      return BiometricService.parseAttemptResult(result, capabilities.label, false);
    } catch (error) {
      console.error('Биометрия: исключение при аутентификации:', error);
      return {
        success: false,
        error: 'not_available',
        message: `Не удалось открыть ${capabilities.label}. Войдите по PIN-коду.`,
        usesDeviceAuth,
      };
    }
  },
};

export default BiometricService;
