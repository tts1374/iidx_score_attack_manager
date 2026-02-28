import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export const APP_LANGUAGE_SETTING_KEY = 'app_language';
export const SUPPORTED_LANGUAGES = ['ja', 'en', 'ko'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'ja';

const resources = {
  ja: { translation: ja },
  en: { translation: en },
  ko: { translation: ko },
} as const;

let initPromise: Promise<void> | null = null;

function isSupportedLanguage(value: string): value is AppLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  if (!value) {
    return DEFAULT_LANGUAGE;
  }
  return isSupportedLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export async function ensureI18n(language: AppLanguage = DEFAULT_LANGUAGE): Promise<void> {
  if (!initPromise) {
    initPromise = i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: language,
        fallbackLng: DEFAULT_LANGUAGE,
        supportedLngs: SUPPORTED_LANGUAGES,
        interpolation: {
          escapeValue: false,
        },
        react: {
          useSuspense: false,
        },
      })
      .then(() => undefined);
  }

  await initPromise;

  const normalized = normalizeLanguage(language);
  if (i18n.language !== normalized) {
    await i18n.changeLanguage(normalized);
  }
}

void ensureI18n(DEFAULT_LANGUAGE);

export default i18n;
