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
  pendingCount: number;
}

export interface TournamentDetailItem extends TournamentListItem {
  charts: TournamentDetailChart[];
}

export interface TournamentDetailChart {
  chartId: number;
  title: string;
  playStyle: string;
  difficulty: string;
  level: string;
  submitted: boolean;
  updateSeq: number;
  fileDeleted: boolean;
}

export interface CreateTournamentInput {
  tournamentName: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  chartIds: number[];
}

export interface ImportTournamentResult {
  status: 'imported' | 'already_imported' | 'conflict';
  tournamentUuid?: string;
}

export interface SongMasterLatest {
  file_name: string;
  schema_version: number;
  sha256: string;
  byte_size: number;
  updated_at?: string;
  download_url?: string;
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
