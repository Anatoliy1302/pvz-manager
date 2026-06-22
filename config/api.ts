import { getExpoPublicEnv } from '../lib/expoPublicEnv';

/** URL API по умолчанию. Переопределяется через EXPO_PUBLIC_API_URL. */
const DEFAULT_API_URL = 'https://api.pvzpersonal.ru';

export function getApiUrl(): string {
  return getExpoPublicEnv('EXPO_PUBLIC_API_URL') ?? DEFAULT_API_URL;
}

/** @deprecated Используйте getApiUrl() — оставлено для совместимости импортов */
export const API_URL = 'https://api.pvzpersonal.ru';

export const AUTH_STORAGE_KEY = 'pvz_auth_session';

/** Auth API paths (VPS). */
export const API_AUTH = {
  sendOtp: '/api/auth/send-otp',
  verifyOtp: '/api/auth/verify-otp',
  login: '/api/auth/login',
  setPin: '/api/auth/set-pin',
  resetPin: '/api/auth/reset-pin',
  /** SMS Aero Mobile Auth — отправка кода на телефон */
  sendSms: '/api/auth/send-sms',
  /** SMS Aero Mobile Auth — проверка кода из SMS */
  verifySms: '/api/auth/verify-sms',
  /** @deprecated alias */
  sendSmsOtp: '/api/auth/send-sms-otp',
  /** @deprecated alias */
  verifySmsOtp: '/api/auth/verify-sms-otp',
} as const;

/** Длина OTP-кода из SMS (SMS Aero Mobile Auth — 4 цифры, тест: 1234). */
export const SMS_OTP_CODE_LENGTH = 4;
