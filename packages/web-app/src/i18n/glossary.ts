import type { AppLanguage } from './index';

export interface GlossaryEntry {
  ja: string;
  en: string;
  ko: string;
}

export const IIDX_GLOSSARY: Record<string, GlossaryEntry> = {
  IR: {
    ja: 'IR',
    en: 'IR',
    ko: 'IR',
  },
  DP: {
    ja: 'DP',
    en: 'DP',
    ko: 'DP',
  },
  BP: {
    ja: 'BP',
    en: 'BP',
    ko: 'BP',
  },
  Arena: {
    ja: 'Arena',
    en: 'Arena',
    ko: '아레나',
  },
  local_reset: {
    ja: 'ローカル初期化',
    en: 'Local reset',
    ko: '로컬 초기화',
  },
  not_restorable: {
    ja: '復元できません',
    en: 'Cannot be restored',
    ko: '복원할 수 없습니다',
  },
};

export function applyGlossaryTerms(text: string, language: AppLanguage): string {
  let output = text;
  for (const entry of Object.values(IIDX_GLOSSARY)) {
    output = output.replaceAll(entry.ja, entry[language]);
  }
  return output;
}
