export const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: '#79d100',
  NORMAL: '#20a8ff',
  HYPER: '#ff7800',
  ANOTHER: '#ff0000',
  LEGGENDARIA: '#ce00d6',
};

export function difficultyColor(difficulty: string): string {
  return DIFFICULTY_COLORS[difficulty] ?? '#6b7280';
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
