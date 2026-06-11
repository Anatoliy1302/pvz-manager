import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import ru from './locales/ru';
import en from './locales/en';
import type { AppLanguage } from './types';

const deviceLang = Localization.getLocales()[0]?.languageCode;
const initialLng: AppLanguage = deviceLang === 'en' ? 'en' : 'ru';

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: initialLng,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;

export const getDateLocale = (): string => (i18n.language === 'en' ? 'en-US' : 'ru-RU');

export const t = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key, options);

export const changeAppLanguage = async (language: AppLanguage): Promise<void> => {
  await i18n.changeLanguage(language);
};
