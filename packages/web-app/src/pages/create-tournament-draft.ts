import type { ChartSummary, CreateTournamentInput, SongSummary } from '@iidx/db';

export type CreateTournamentPlayStyle = 'SP' | 'DP';

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
  hasRequiredFields: boolean;
  hasUnselectedChart: boolean;
  periodError: string | null;
  canProceed: boolean;
}

export const MAX_CHART_ROWS = 4;
export const CREATE_TOURNAMENT_CONFIRM_NOTICES = ['大会定義は作成後に変更できません。'] as const;

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
    name: '',
    owner: '',
    hashtag: '',
    startDate: todayDate,
    endDate: todayDate,
    rows: [createEmptyChartDraft()],
  };
}

export function resolveCreateTournamentValidation(draft: CreateTournamentDraft): CreateTournamentValidationResult {
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

  const hasRequiredFields =
    draft.name.trim().length > 0 &&
    draft.owner.trim().length > 0 &&
    draft.hashtag.trim().length > 0 &&
    draft.startDate.trim().length > 0 &&
    draft.endDate.trim().length > 0;
  const periodError =
    draft.startDate && draft.endDate && draft.startDate > draft.endDate ? '開始日は終了日以前を指定してください。' : null;
  const hasUnselectedChart = draft.rows.some((row) => row.selectedChartId === null);

  return {
    selectedChartIds,
    duplicateChartIds,
    hasRequiredFields,
    hasUnselectedChart,
    periodError,
    canProceed:
      draft.rows.length > 0 &&
      hasRequiredFields &&
      periodError === null &&
      !hasUnselectedChart &&
      duplicateChartIds.size === 0,
  };
}

export function buildCreateTournamentInput(draft: CreateTournamentDraft, selectedChartIds: number[]): CreateTournamentInput {
  return {
    tournamentName: draft.name.trim(),
    owner: draft.owner.trim(),
    hashtag: draft.hashtag.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    chartIds: selectedChartIds,
  };
}

export function normalizeHashtagForDisplay(value: string): string {
  const normalized = value.trim().replace(/^#+/, '');
  if (!normalized) {
    return '';
  }
  return `#${normalized}`;
}

export function resolveSelectedChartOption(row: CreateTournamentChartDraft): ChartSummary | null {
  if (row.selectedChartId === null) {
    return null;
  }
  return row.chartOptions.find((chart) => chart.chartId === row.selectedChartId) ?? null;
}
