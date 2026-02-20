import type { TournamentPayload } from '@iidx/shared';

export type TournamentTab = 'active' | 'upcoming' | 'ended';

export interface TournamentListItem {
  tournamentUuid: string;
  sourceTournamentUuid: string | null;
  tournamentName: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  isImported: boolean;
  chartCount: number;
  submittedCount: number;
  sendWaitingCount: number;
  pendingCount: number;
}

export interface TournamentDetailItem extends TournamentListItem {
  defHash: string;
  lastSubmittedAt: string | null;
  charts: TournamentDetailChart[];
}

export type TournamentChartResolveIssue = 'MASTER_MISSING' | 'CHART_NOT_FOUND';

export interface TournamentDetailChart {
  chartId: number;
  title: string;
  playStyle: string;
  difficulty: string;
  level: string;
  resolveIssue: TournamentChartResolveIssue | null;
  submitted: boolean;
  updateSeq: number;
  needsSend: boolean;
  fileDeleted: boolean;
}

export interface CreateTournamentInput {
  tournamentUuid?: string;
  tournamentName: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  chartIds: number[];
}

export interface ImportTournamentImportedResult {
  status: 'imported';
  tournamentUuid: string;
  addedCharts: number;
  existingCharts: number;
}

export interface ImportTournamentMergedResult {
  status: 'merged';
  tournamentUuid: string;
  addedCharts: number;
  existingCharts: number;
}

export interface ImportTournamentUnchangedResult {
  status: 'unchanged';
  tournamentUuid: string;
  addedCharts: 0;
  existingCharts: number;
}

export interface ImportTournamentIncompatibleResult {
  status: 'incompatible';
  tournamentUuid: string;
  reason: 'period_mismatch';
}

export type ImportTournamentResult =
  | ImportTournamentImportedResult
  | ImportTournamentMergedResult
  | ImportTournamentUnchangedResult
  | ImportTournamentIncompatibleResult;

export interface ImportTargetTournament {
  tournamentUuid: string;
  sourceTournamentUuid: string | null;
  tournamentName: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  chartIds: number[];
}

export interface SongMasterChartDetail {
  chartId: number;
  title: string;
  playStyle: string;
  difficulty: string;
  level: string;
}

export interface SongMasterLatest {
  file_name: string;
  schema_version: string | number;
  generated_at: string;
  sha256: string;
  byte_size: number;
}

export interface SongSummary {
  musicId: number;
  title: string;
  version: string | number;
}

export interface ChartSummary {
  chartId: number;
  musicId: number;
  playStyle: string;
  difficulty: string;
  level: string;
  isActive: number;
}

export interface RuntimeClock {
  nowIso(): string;
  todayJst(): string;
}

export interface IdFactory {
  uuid(): string;
}

export interface ImportTournamentPayload extends TournamentPayload {}
