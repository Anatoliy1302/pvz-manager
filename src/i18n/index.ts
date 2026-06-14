import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import ru from './locales/ru';
import type { AppLanguage } from './types';
import { SUPPORTED_LANGUAGES } from './types';

const deviceLang = Localization.getLocales()[0]?.languageCode;
const initialLng: AppLanguage = SUPPORTED_LANGUAGES.includes(deviceLang as AppLanguage)
  ? (deviceLang as AppLanguage)
  : 'ru';

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
  },
  lng: 'ru',
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
  partialBundledLanguages: true,
});

export { changeAppLanguage, ensureLocaleLoaded } from './loadLocale';

export default i18n;

export const getDateLocale = (): string => {
  if (i18n.language === 'en') return 'en-US';
  if (i18n.language === 'be') return 'be-BY';
  if (i18n.language === 'kk') return 'kk-KZ';
  if (i18n.language === 'ky') return 'ky-KG';
  if (i18n.language === 'uz') return 'uz-UZ';
  if (i18n.language === 'hy') return 'hy-AM';
  if (i18n.language === 'tg') return 'tg-TJ';
  if (i18n.language === 'ka') return 'ka-GE';
  return 'ru-RU';
};

export const t = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key, options);

void (async () => {
  if (initialLng === 'ru') return;
  try {
    const { ensureLocaleLoaded: load, changeAppLanguage: apply } = await import('./loadLocale');
    await load(initialLng);
    await apply(initialLng);
  } catch (error) {
    console.warn('Failed to preload device locale:', error);
  }
})();
