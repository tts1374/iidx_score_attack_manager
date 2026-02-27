import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ja: { translation: {} },
  en: { translation: {} },
  ko: { translation: {} },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ja',
  fallbackLng: 'ja',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;
