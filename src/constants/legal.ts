import Constants from 'expo-constants';
import { Linking } from 'react-native';

export const APP_DISPLAY_NAME = 'Персонал ПВЗ';

/** Краткое наименование для UI */
export const OPERATOR_NAME = 'ИП Кравец Н.В.';

export const OPERATOR_FULL_NAME =
  'Индивидуальный предприниматель Кравец Надежда Васильевна';

export const OPERATOR_ADDRESS =
  '690033, Россия, Приморский край, г. Владивосток, ул. Гамарника, д. 7, кв. 19';

export const OPERATOR_INN = '253618566105';
export const OPERATOR_OGRNIP = '325253600052735';

export const OPERATOR_BANK = {
  name: 'АО «ТБанк»',
  inn: '7710140679',
  bik: '044525974',
  account: '40802810500008360669',
  corrAccount: '30101810145250000974',
  address: '127287, г. Москва, ул. Хуторская 2-я, д. 38А, стр. 26',
} as const;

export const SUPPORT_EMAIL = 'support@pvzpersonal.ru';

export const LEGAL_DOCUMENTS_UPDATED = '17 июня 2026 г.';
export const PRIVACY_POLICY_UPDATED = LEGAL_DOCUMENTS_UPDATED;

export const PRIVACY_POLICY_URL = 'https://pvzpersonal.ru/privacy';
export const TERMS_OF_USE_URL = 'https://pvzpersonal.ru/terms';
export const CONSENT_URL = 'https://pvzpersonal.ru/consent';

export type LegalDocument = 'privacy' | 'terms' | 'consent';

const LEGAL_DOCUMENT_URLS: Record<LegalDocument, string> = {
  privacy: PRIVACY_POLICY_URL,
  terms: TERMS_OF_USE_URL,
  consent: CONSENT_URL,
};

export function openLegalDocument(document: LegalDocument): void {
  Linking.openURL(LEGAL_DOCUMENT_URLS[document]);
}

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

export function getCopyrightYear(): number {
  return new Date().getFullYear();
}
