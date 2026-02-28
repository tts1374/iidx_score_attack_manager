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

export type TournamentValidationCode =
  | 'TOURNAMENT_NAME_REQUIRED'
  | 'TOURNAMENT_NAME_TOO_LONG'
  | 'TOURNAMENT_OWNER_REQUIRED'
  | 'TOURNAMENT_OWNER_TOO_LONG'
  | 'TOURNAMENT_HASHTAG_REQUIRED'
  | 'TOURNAMENT_START_DATE_FORMAT'
  | 'TOURNAMENT_END_DATE_FORMAT'
  | 'TOURNAMENT_DATE_RANGE_INVALID'
  | 'TOURNAMENT_PAST_DATE_NOT_ALLOWED'
  | 'TOURNAMENT_CHART_REQUIRED'
  | 'TOURNAMENT_CHART_TOO_MANY'
  | 'TOURNAMENT_CHART_DUPLICATE';

export interface TournamentValidationIssue {
  code: TournamentValidationCode;
  params?: Record<string, unknown>;
}

export function validateTournamentInput(input: TournamentInput, todayDate: string): TournamentValidationIssue[] {
  const errors: TournamentValidationIssue[] = [];
  const normalizedHashtag = normalizeHashtag(input.hashtag);

  if (!input.tournamentName.trim()) {
    errors.push({ code: 'TOURNAMENT_NAME_REQUIRED' });
  } else if (input.tournamentName.trim().length > TOURNAMENT_TEXT_MAX) {
    errors.push({ code: 'TOURNAMENT_NAME_TOO_LONG', params: { max: TOURNAMENT_TEXT_MAX } });
  }

  if (!input.owner.trim()) {
    errors.push({ code: 'TOURNAMENT_OWNER_REQUIRED' });
  } else if (input.owner.trim().length > TOURNAMENT_TEXT_MAX) {
    errors.push({ code: 'TOURNAMENT_OWNER_TOO_LONG', params: { max: TOURNAMENT_TEXT_MAX } });
  }

  if (!normalizedHashtag) {
    errors.push({ code: 'TOURNAMENT_HASHTAG_REQUIRED' });
  }

  if (!ISO_DATE_RE.test(input.startDate)) {
    errors.push({ code: 'TOURNAMENT_START_DATE_FORMAT' });
  }
  if (!ISO_DATE_RE.test(input.endDate)) {
    errors.push({ code: 'TOURNAMENT_END_DATE_FORMAT' });
  }
  if (ISO_DATE_RE.test(input.startDate) && ISO_DATE_RE.test(input.endDate) && input.startDate > input.endDate) {
    errors.push({ code: 'TOURNAMENT_DATE_RANGE_INVALID' });
  }
  if (ISO_DATE_RE.test(input.endDate) && input.endDate < todayDate) {
    errors.push({ code: 'TOURNAMENT_PAST_DATE_NOT_ALLOWED' });
  }

  if (input.chartIds.length === 0) {
    errors.push({ code: 'TOURNAMENT_CHART_REQUIRED' });
  } else if (input.chartIds.length > TOURNAMENT_MAX_CHARTS) {
    errors.push({ code: 'TOURNAMENT_CHART_TOO_MANY', params: { max: TOURNAMENT_MAX_CHARTS } });
  }

  const uniqueChartIds = new Set(input.chartIds);
  if (uniqueChartIds.size !== input.chartIds.length) {
    errors.push({ code: 'TOURNAMENT_CHART_DUPLICATE' });
  }

  return errors;
}
