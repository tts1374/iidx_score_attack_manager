import type { ChartSummary, CreateTournamentInput, SongSummary } from '@iidx/db';
import { formatHashtagForDisplay, normalizeHashtag } from '@iidx/shared';

export type CreateTournamentPlayStyle = 'SP' | 'DP';
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateTournamentChartDraft {
  key: string;
  query: string;
  options: SongSummary[];
  selectedSong: SongSummary | null;
  playStyle: CreateTournamentPlayStyle;
  chartOptions: ChartSummary[];
  selectedChartId: number | null;
  loading: boolean;
}

export interface CreateTournamentDraft {
  tournamentUuid: string;
  name: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  rows: CreateTournamentChartDraft[];
}

export type CreateTournamentFieldLabelKey =
  | 'create_tournament.field.name.label_plain'
  | 'create_tournament.field.owner.label_plain'
  | 'create_tournament.field.hashtag.label_plain'
  | 'create_tournament.field.period.label_plain';

export type CreateTournamentValidationMessageKey =
  | 'create_tournament.validation.name_required'
  | 'create_tournament.validation.owner_required'
  | 'create_tournament.validation.hashtag_required'
  | 'create_tournament.validation.start_date_required'
  | 'create_tournament.validation.end_date_required'
  | 'create_tournament.validation.end_date_after_start'
  | 'create_tournament.validation.end_date_from_today'
  | 'create_tournament.validation.chart_required'
  | 'create_tournament.validation.chart_difficulty_required'
  | 'create_tournament.validation.chart_duplicate';

export interface CreateTournamentValidationResult {
  selectedChartIds: number[];
  duplicateChartIds: Set<number>;
  nameError: CreateTournamentValidationMessageKey | null;
  ownerError: CreateTournamentValidationMessageKey | null;
  hashtagError: CreateTournamentValidationMessageKey | null;
  startDateError: CreateTournamentValidationMessageKey | null;
  endDateError: CreateTournamentValidationMessageKey | null;
  missingBasicFields: CreateTournamentFieldLabelKey[];
  basicCompletedCount: number;
  hasRequiredFields: boolean;
  hasUnselectedChart: boolean;
  chartStepError: CreateTournamentValidationMessageKey | null;
  periodError: CreateTournamentValidationMessageKey | null;
  canProceed: boolean;
}

export const MAX_CHART_ROWS = 4;

export function createEmptyChartDraft(): CreateTournamentChartDraft {
  return {
    key: crypto.randomUUID(),
    query: '',
    options: [],
    selectedSong: null,
    playStyle: 'SP',
    chartOptions: [],
    selectedChartId: null,
    loading: false,
  };
}

export function createInitialTournamentDraft(todayDate: string): CreateTournamentDraft {
  return {
    tournamentUuid: crypto.randomUUID(),
    name: '',
    owner: '',
    hashtag: '',
    startDate: todayDate,
    endDate: todayDate,
    rows: [createEmptyChartDraft()],
  };
}

export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function formatIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveNextMonthDateRange(todayDate: string): { startDate: string; endDate: string } {
  const baseDate = parseIsoDate(todayDate) ?? new Date();
  const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
  const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 2, 0);
  return {
    startDate: formatIsoDate(startDate),
    endDate: formatIsoDate(endDate),
  };
}

export function resolveRangeDayCount(startDate: string, endDate: string): number | null {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) {
    return null;
  }
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  if (endUtc < startUtc) {
    return null;
  }
  return Math.floor((endUtc - startUtc) / DAY_MS) + 1;
}

export function resolveCreateTournamentValidation(
  draft: CreateTournamentDraft,
  todayDate: string,
): CreateTournamentValidationResult {
  const selectedChartIds = draft.rows
    .map((row) => row.selectedChartId)
    .filter((value): value is number => value !== null);

  const chartIdCounts = new Map<number, number>();
  for (const chartId of selectedChartIds) {
    chartIdCounts.set(chartId, (chartIdCounts.get(chartId) ?? 0) + 1);
  }
  const duplicateChartIds = new Set<number>();
  for (const [chartId, count] of chartIdCounts.entries()) {
    if (count > 1) {
      duplicateChartIds.add(chartId);
    }
  }

  const nameError = draft.name.trim().length === 0 ? 'create_tournament.validation.name_required' : null;
  const ownerError = draft.owner.trim().length === 0 ? 'create_tournament.validation.owner_required' : null;
  const hashtagError = normalizeHashtag(draft.hashtag).length === 0 ? 'create_tournament.validation.hashtag_required' : null;
  const startDateRequiredError = draft.startDate.trim().length === 0 ? 'create_tournament.validation.start_date_required' : null;
  const endDateRequiredError = draft.endDate.trim().length === 0 ? 'create_tournament.validation.end_date_required' : null;
  const startDateError = startDateRequiredError;

  let endDateError: CreateTournamentValidationMessageKey | null = endDateRequiredError;
  if (!endDateError && !startDateRequiredError && draft.startDate > draft.endDate) {
    endDateError = 'create_tournament.validation.end_date_after_start';
  } else if (!endDateError && draft.endDate < todayDate) {
    endDateError = 'create_tournament.validation.end_date_from_today';
  }
  const periodError: CreateTournamentValidationMessageKey | null = endDateError;

  const missingBasicFields: CreateTournamentFieldLabelKey[] = [];
  if (nameError) {
    missingBasicFields.push('create_tournament.field.name.label_plain');
  }
  if (ownerError) {
    missingBasicFields.push('create_tournament.field.owner.label_plain');
  }
  if (hashtagError) {
    missingBasicFields.push('create_tournament.field.hashtag.label_plain');
  }
  if (startDateRequiredError || endDateRequiredError) {
    missingBasicFields.push('create_tournament.field.period.label_plain');
  }
  const basicCompletedCount = 4 - missingBasicFields.length;
  const hasRequiredFields = missingBasicFields.length === 0 && periodError === null;

  const hasUnselectedChart = draft.rows.some((row) => row.selectedChartId === null);
  const chartStepError: CreateTournamentValidationMessageKey | null =
    draft.rows.length === 0
      ? 'create_tournament.validation.chart_required'
      : hasUnselectedChart
        ? 'create_tournament.validation.chart_difficulty_required'
        : duplicateChartIds.size > 0
          ? 'create_tournament.validation.chart_duplicate'
          : null;

  return {
    selectedChartIds,
    duplicateChartIds,
    nameError,
    ownerError,
    hashtagError,
    startDateError,
    endDateError,
    missingBasicFields,
    basicCompletedCount,
    hasRequiredFields,
    hasUnselectedChart,
    chartStepError,
    periodError,
    canProceed:
      draft.rows.length > 0 &&
      hasRequiredFields &&
      chartStepError === null,
  };
}

export function buildCreateTournamentInput(draft: CreateTournamentDraft, selectedChartIds: number[]): CreateTournamentInput {
  return {
    tournamentUuid: draft.tournamentUuid,
    tournamentName: draft.name.trim(),
    owner: draft.owner.trim(),
    hashtag: normalizeHashtag(draft.hashtag),
    startDate: draft.startDate,
    endDate: draft.endDate,
    chartIds: selectedChartIds,
  };
}

export function normalizeHashtagForDisplay(value: string): string {
  return formatHashtagForDisplay(value);
}

export function resolveSelectedChartOption(row: CreateTournamentChartDraft): ChartSummary | null {
  if (row.selectedChartId === null) {
    return null;
  }
  return row.chartOptions.find((chart) => chart.chartId === row.selectedChartId) ?? null;
}
