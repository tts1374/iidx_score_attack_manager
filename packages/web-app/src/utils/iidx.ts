export const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: '#79d100',
  NORMAL: '#20a8ff',
  HYPER: '#ff7800',
  ANOTHER: '#ff0000',
  LEGGENDARIA: '#ce00d6',
};

const VERSION_LABEL_MAP: Record<string, string> = {
  '1': '1st style',
  SS: 'substream',
  '0': 'INFINITAS',
  '2': '2nd style',
  '3': '3rd style',
  '4': '4th style',
  '5': '5th style',
  '6': '6th style',
  '7': '7th style',
  '8': '8th style',
  '9': '9th style',
  '10': '10th style',
  '11': 'IIDX RED',
  '12': 'HAPPY SKY',
  '13': 'DistorteD',
  '14': 'GOLD',
  '15': 'DJ TROOPERS',
  '16': 'EMPRESS',
  '17': 'SIRIUS',
  '18': 'Resort Anthem',
  '19': 'Lincle',
  '20': 'tricoro',
  '21': 'SPADA',
  '22': 'PENDUAL',
  '23': 'copula',
  '24': 'SINOBUZ',
  '25': 'CANNON BALLERS',
  '26': 'Rootage',
  '27': 'HEROIC VERSE',
  '28': 'BISTROVER',
  '29': 'CastHour',
  '30': 'RESIDENT',
  '31': 'EPOLIS',
  '32': 'Pinky Crush',
  '33': 'Sparkle Shower',
};

export function difficultyColor(difficulty: string): string {
  return DIFFICULTY_COLORS[difficulty] ?? '#6b7280';
}

export function versionLabel(version: unknown): string {
  if (version === null || version === undefined) {
    return '-';
  }

  const raw = String(version).trim();
  if (raw.length === 0) {
    return '-';
  }

  const normalizedKey = raw.toUpperCase() === 'SS' ? 'SS' : raw;
  return VERSION_LABEL_MAP[normalizedKey] ?? raw;
}

export function statusLabel(status: 'active' | 'upcoming' | 'ended', days?: number): string {
  if (status === 'active') {
    if (days !== undefined && days <= 0) {
      return '本日まで';
    }
    if (days !== undefined) {
      return `残り${days}日`;
    }
    return '開催中';
  }
  if (status === 'upcoming') {
    if (days !== undefined) {
      return `あと${days}日`;
    }
    return '開催前';
  }
  return '終了';
}
