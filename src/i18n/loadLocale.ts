import i18n from 'i18next';
import type { AppLanguage } from './types';

type LocaleModule = { default: Record<string, unknown> };

const localeLoaders: Record<AppLanguage, () => Promise<LocaleModule>> = {
  ru: () => import('./locales/ru'),
  en: () => import('./locales/en'),
  be: () => import('./locales/be'),
  kk: () => import('./locales/kk'),
  ky: () => import('./locales/ky'),
  uz: () => import('./locales/uz'),
  hy: () => import('./locales/hy'),
  tg: () => import('./locales/tg'),
  ka: () => import('./locales/ka'),
};

export async function ensureLocaleLoaded(language: AppLanguage): Promise<void> {
  if (i18n.hasResourceBundle(language, 'translation')) {
    return;
  }
  const mod = await localeLoaders[language]();
  i18n.addResourceBundle(language, 'translation', mod.default, true, true);
}

export async function changeAppLanguage(language: AppLanguage): Promise<void> {
  await ensureLocaleLoaded(language);
  await i18n.changeLanguage(language);
}
