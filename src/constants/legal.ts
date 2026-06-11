import Constants from 'expo-constants';

export const APP_DISPLAY_NAME = 'Персонал ПВЗ';

export const OPERATOR_NAME = 'ИП Кравец Н.В.';

export const SUPPORT_EMAIL = 'razrabotka_vl@mail.ru';

export const PRIVACY_POLICY_UPDATED = '8 июня 2025 г.';

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

export function getCopyrightYear(): number {
  return new Date().getFullYear();
}
