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

export interface CreateTournamentValidationResult {
  selectedChartIds: number[];
  duplicateChartIds: Set<number>;
  nameError: string | null;
  ownerError: string | null;
  hashtagError: string | null;
  startDateError: string | null;
  endDateError: string | null;
  missingBasicFields: string[];
  basicCompletedCount: number;
  hasRequiredFields: boolean;
  hasUnselectedChart: boolean;
  chartStepError: string | null;
  periodError: string | null;
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

  const nameError = draft.name.trim().length === 0 ? '大会名を入力してください。' : null;
  const ownerError = draft.owner.trim().length === 0 ? '開催者を入力してください。' : null;
  const hashtagError = normalizeHashtag(draft.hashtag).length === 0 ? 'ハッシュタグを入力してください。' : null;
  const startDateRequiredError = draft.startDate.trim().length === 0 ? '開始日を選択してください。' : null;
  const endDateRequiredError = draft.endDate.trim().length === 0 ? '終了日を選択してください。' : null;
  const startDateError = startDateRequiredError;

  let endDateError = endDateRequiredError;
  if (!endDateError && !startDateRequiredError && draft.startDate > draft.endDate) {
    endDateError = '終了日は開始日以降を指定してください。';
  } else if (!endDateError && draft.endDate < todayDate) {
    endDateError = '終了日には今日以降の日付を指定してください。';
  }
  const periodError = endDateError;

  const missingBasicFields: string[] = [];
  if (nameError) {
    missingBasicFields.push('大会名');
  }
  if (ownerError) {
    missingBasicFields.push('開催者');
  }
  if (hashtagError) {
    missingBasicFields.push('ハッシュタグ');
  }
  if (startDateRequiredError || endDateRequiredError) {
    missingBasicFields.push('期間');
  }
  const basicCompletedCount = 4 - missingBasicFields.length;
  const hasRequiredFields = missingBasicFields.length === 0 && periodError === null;

  const hasUnselectedChart = draft.rows.some((row) => row.selectedChartId === null);
  const chartStepError =
    draft.rows.length === 0
      ? '譜面を1件以上選択してください。'
      : hasUnselectedChart
        ? '各譜面で難易度を選択してください。'
        : duplicateChartIds.size > 0
          ? '同一譜面を重複登録できません。'
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
