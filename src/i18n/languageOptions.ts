import type { AppLanguage } from './types';

export const LANGUAGE_OPTIONS: { code: AppLanguage; labelKey: string }[] = [
  { code: 'ru', labelKey: 'common.language.russian' },
  { code: 'be', labelKey: 'common.language.belarusian' },
  { code: 'kk', labelKey: 'common.language.kazakh' },
  { code: 'ky', labelKey: 'common.language.kyrgyz' },
  { code: 'uz', labelKey: 'common.language.uzbek' },
  { code: 'hy', labelKey: 'common.language.armenian' },
  { code: 'tg', labelKey: 'common.language.tajik' },
  { code: 'ka', labelKey: 'common.language.georgian' },
  { code: 'en', labelKey: 'common.language.english' },
];

export function getLanguageLabelKey(code: AppLanguage): string {
  return LANGUAGE_OPTIONS.find((option) => option.code === code)?.labelKey ?? 'common.language.russian';
}
