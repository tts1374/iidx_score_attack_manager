import { TOURNAMENT_MAX_CHARTS, TOURNAMENT_TEXT_MAX } from './types.js';
import { normalizeHashtag } from './normalize.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TournamentInput {
  tournamentName: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  chartIds: number[];
}

export function validateTournamentInput(input: TournamentInput, todayDate: string): string[] {
  const errors: string[] = [];
  const normalizedHashtag = normalizeHashtag(input.hashtag);

  if (!input.tournamentName.trim()) {
    errors.push('大会名を入力してください。');
  } else if (input.tournamentName.trim().length > TOURNAMENT_TEXT_MAX) {
    errors.push('大会名は50文字以内で入力してください。');
  }

  if (!input.owner.trim()) {
    errors.push('開催者を入力してください。');
  } else if (input.owner.trim().length > TOURNAMENT_TEXT_MAX) {
    errors.push('開催者は50文字以内で入力してください。');
  }

  if (!normalizedHashtag) {
    errors.push('ハッシュタグを入力してください。');
  }

  if (!ISO_DATE_RE.test(input.startDate)) {
    errors.push('開始日はYYYY-MM-DD形式で入力してください。');
  }
  if (!ISO_DATE_RE.test(input.endDate)) {
    errors.push('終了日はYYYY-MM-DD形式で入力してください。');
  }
  if (ISO_DATE_RE.test(input.startDate) && ISO_DATE_RE.test(input.endDate) && input.startDate > input.endDate) {
    errors.push('開始日は終了日以前を指定してください。');
  }
  if (ISO_DATE_RE.test(input.endDate) && input.endDate < todayDate) {
    errors.push('過去に終了した大会は登録できません。');
  }

  if (input.chartIds.length === 0) {
    errors.push('譜面を1件以上選択してください。');
  } else if (input.chartIds.length > TOURNAMENT_MAX_CHARTS) {
    errors.push('譜面は最大4件です。');
  }

  const uniqueChartIds = new Set(input.chartIds);
  if (uniqueChartIds.size !== input.chartIds.length) {
    errors.push('同一譜面を重複登録できません。');
  }

  return errors;
}
