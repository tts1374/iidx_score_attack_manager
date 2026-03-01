import type { AppDatabase, OpfsStorage } from '@iidx/db';
import { describe, expect, it, vi } from 'vitest';

import { buildHomeFilterSampleDefinitions, seedHomeFilterSamples } from './home-filter-sample-seed';

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

interface MockSeedEnvironmentOptions {
  unresolvedDetail?: boolean;
  insufficientSelectableCharts?: boolean;
}

interface MockEvidenceState {
  updateSeq: number;
  needsSend: boolean;
  fileDeleted: boolean;
}

interface MockStoredTournament {
  tournamentUuid: string;
  chartIds: number[];
  evidenceByChartId: Map<number, MockEvidenceState>;
}

function createMockSeedEnvironment(options: MockSeedEnvironmentOptions = {}): {
  appDb: AppDatabase;
  opfs: OpfsStorage;
  getTournamentDetailMock: ReturnType<typeof vi.fn>;
  markEvidenceSendCompletedMock: ReturnType<typeof vi.fn>;
  writeFileAtomicMock: ReturnType<typeof vi.fn>;
} {
  const clock = {
    todayJst: vi.fn(() => '2026-03-01'),
  };
  const tournaments = new Map<string, MockStoredTournament>();
  const listRowsByTab: Record<'active' | 'upcoming' | 'ended', unknown[]> = {
    active: [],
    upcoming: [],
    ended: [],
  };
  const songs = options.insufficientSelectableCharts
    ? [{ musicId: 1 }]
    : Array.from({ length: 9 }, (_, index) => ({
      musicId: index + 1,
    }));
  const chartBySongAndStyle = new Map<number, { SP: number | null; DP: number | null }>();
  let nextChartId = 910001;
  songs.forEach((song) => {
    const sp = nextChartId;
    nextChartId += 1;
    const dp = options.insufficientSelectableCharts ? null : nextChartId;
    if (!options.insufficientSelectableCharts) {
      nextChartId += 1;
    }
    chartBySongAndStyle.set(song.musicId, { SP: sp, DP: dp });
  });
  let createdSeq = 0;

  const listTournamentsMock = vi.fn(async (tab: 'active' | 'upcoming' | 'ended') => listRowsByTab[tab] ?? []);
  const deleteTournamentMock = vi.fn(async (_tournamentUuid: string) => undefined);
  const searchSongsByPrefixMock = vi.fn(async (_prefix: string, _limit: number) => songs);
  const getChartsByMusicAndStyleMock = vi.fn(async (musicId: number, style: 'SP' | 'DP') => {
    const pair = chartBySongAndStyle.get(musicId);
    const chartId = pair ? pair[style] : null;
    if (!chartId) {
      return [];
    }
    return [
      {
        chartId,
        level: '12',
        isActive: 1,
      },
    ];
  });

  const createTournamentMock = vi.fn(async (input: { chartIds: number[]; endDate: string }) => {
    if (input.endDate < clock.todayJst()) {
      throw new Error('TOURNAMENT_PAST_DATE_NOT_ALLOWED');
    }
    createdSeq += 1;
    const tournamentUuid = `created-${createdSeq}`;
    tournaments.set(tournamentUuid, {
      tournamentUuid,
      chartIds: [...input.chartIds],
      evidenceByChartId: new Map(),
    });
    return tournamentUuid;
  });
  const importTournamentMock = vi.fn(async (payload: { uuid: string; charts: number[]; end: string }) => {
    if (payload.end < clock.todayJst()) {
      throw new Error('PAST_TOURNAMENT');
    }
    const tournamentUuid = payload.uuid;
    tournaments.set(tournamentUuid, {
      tournamentUuid,
      chartIds: [...payload.charts],
      evidenceByChartId: new Map(),
    });
    return {
      tournamentUuid,
    };
  });

  const getEvidenceRelativePathMock = vi.fn(async (tournamentUuid: string, chartId: number) => {
    return `evidences/${tournamentUuid}/${chartId}.jpg`;
  });
  const upsertEvidenceMetadataMock = vi.fn(async (input: { tournamentUuid: string; chartId: number }) => {
    const row = tournaments.get(input.tournamentUuid);
    if (!row) {
      throw new Error(`Tournament not found: ${input.tournamentUuid}`);
    }
    row.evidenceByChartId.set(input.chartId, {
      updateSeq: 1,
      needsSend: true,
      fileDeleted: false,
    });
  });
  const markEvidenceSendCompletedMock = vi.fn(async (tournamentUuid: string, chartIds: number[]) => {
    const row = tournaments.get(tournamentUuid);
    if (!row) {
      throw new Error(`Tournament not found: ${tournamentUuid}`);
    }
    chartIds.forEach((chartId) => {
      const existing = row.evidenceByChartId.get(chartId);
      if (!existing) {
        throw new Error(`Evidence not found: ${tournamentUuid}/${chartId}`);
      }
      row.evidenceByChartId.set(chartId, {
        ...existing,
        needsSend: false,
      });
    });
  });

  const getTournamentDetailMock = vi.fn(async (tournamentUuid: string) => {
    const row = tournaments.get(tournamentUuid);
    if (!row) {
      return null;
    }
    return {
      tournamentUuid,
      charts: row.chartIds.map((chartId, index) => {
        const evidence = row.evidenceByChartId.get(chartId);
        return {
          chartId,
          resolveIssue: options.unresolvedDetail && index === 0 ? 'missing_song_master' : null,
          updateSeq: evidence?.updateSeq ?? 0,
          fileDeleted: evidence?.fileDeleted ?? false,
          needsSend: evidence?.needsSend ?? false,
        };
      }),
    };
  });

  const appDb = {
    clock,
    listTournaments: listTournamentsMock,
    deleteTournament: deleteTournamentMock,
    searchSongsByPrefix: searchSongsByPrefixMock,
    getChartsByMusicAndStyle: getChartsByMusicAndStyleMock,
    createTournament: createTournamentMock,
    importTournament: importTournamentMock,
    getEvidenceRelativePath: getEvidenceRelativePathMock,
    upsertEvidenceMetadata: upsertEvidenceMetadataMock,
    markEvidenceSendCompleted: markEvidenceSendCompletedMock,
    getTournamentDetail: getTournamentDetailMock,
  } as unknown as AppDatabase;

  const writeFileAtomicMock = vi.fn(async (_path: string, _bytes: Uint8Array) => undefined);
  const opfs = {
    writeFileAtomic: writeFileAtomicMock,
  } as unknown as OpfsStorage;

  return {
    appDb,
    opfs,
    getTournamentDetailMock,
    markEvidenceSendCompletedMock,
    writeFileAtomicMock,
  };
}

describe('home-filter-sample-seed', () => {
  it('builds definitions that cover state/source/category/send-waiting filters', () => {
    const today = '2026-03-01';
    const rows = buildHomeFilterSampleDefinitions(today);

    expect(rows.length).toBeGreaterThanOrEqual(6);

    const states = new Set(rows.map((row) => row.state));
    expect(states).toEqual(new Set(['active', 'upcoming', 'ended']));

    const sources = new Set(rows.map((row) => row.source));
    expect(sources).toEqual(new Set(['created', 'imported']));

    const hasSendWaiting = rows.some((row) => row.unsharedChartIndexes.length > 0);
    expect(hasSendWaiting).toBe(true);

    const hasNoEvidenceFlow = rows.some((row) => row.sharedChartIndexes.length + row.unsharedChartIndexes.length < row.chartIds.length);
    const hasSharedFlow = rows.some((row) => row.sharedChartIndexes.length > 0);
    const hasUnsharedFlow = rows.some((row) => row.unsharedChartIndexes.length > 0);
    expect(hasNoEvidenceFlow).toBe(true);
    expect(hasSharedFlow).toBe(true);
    expect(hasUnsharedFlow).toBe(true);

    const categories = new Set(
      rows.map((row) => {
        const submittedCount = row.sharedChartIndexes.length + row.unsharedChartIndexes.length;
        return submittedCount === row.chartIds.length ? 'completed' : 'pending';
      }),
    );
    expect(categories).toEqual(new Set(['pending', 'completed']));
  });

  it('assigns date ranges by state relative to today', () => {
    const today = '2026-03-01';
    const todayDate = toDate(today);
    const rows = buildHomeFilterSampleDefinitions(today);

    rows.forEach((row) => {
      const start = toDate(row.startDate);
      const end = toDate(row.endDate);
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime());

      if (row.state === 'active') {
        expect(start.getTime()).toBeLessThanOrEqual(todayDate.getTime());
        expect(end.getTime()).toBeGreaterThanOrEqual(todayDate.getTime());
      } else if (row.state === 'upcoming') {
        expect(start.getTime()).toBeGreaterThan(todayDate.getTime());
      } else {
        expect(end.getTime()).toBeLessThan(todayDate.getTime());
      }
    });
  });

  it('seeds tournaments that keep detail/submit flows resolvable', async () => {
    const mock = createMockSeedEnvironment();
    const result = await seedHomeFilterSamples({
      appDb: mock.appDb,
      opfs: mock.opfs,
      todayDate: '2026-03-01',
    });

    expect(result.createdSampleCount).toBeGreaterThan(0);
    expect(mock.writeFileAtomicMock).toHaveBeenCalled();
    expect(mock.markEvidenceSendCompletedMock).toHaveBeenCalled();

    let hasNoEvidenceChart = false;
    let hasUnsharedEvidenceChart = false;
    let hasSharedEvidenceChart = false;

    for (const entry of result.created) {
      const detail = await mock.getTournamentDetailMock(entry.tournamentUuid);
      expect(detail).not.toBeNull();
      for (const chart of detail.charts) {
        expect(chart.resolveIssue).toBeNull();
        const localSaved = chart.updateSeq > 0 && !chart.fileDeleted;
        if (!localSaved) {
          hasNoEvidenceChart = true;
        } else if (chart.needsSend) {
          hasUnsharedEvidenceChart = true;
        } else {
          hasSharedEvidenceChart = true;
        }
      }
    }

    expect(hasNoEvidenceChart).toBe(true);
    expect(hasUnsharedEvidenceChart).toBe(true);
    expect(hasSharedEvidenceChart).toBe(true);
  });

  it('fails fast when detail is not resolvable', async () => {
    const mock = createMockSeedEnvironment({ unresolvedDetail: true });

    await expect(
      seedHomeFilterSamples({
        appDb: mock.appDb,
        opfs: mock.opfs,
        todayDate: '2026-03-01',
      }),
    ).rejects.toThrow(/Sample tournament has unresolved charts/);
  });

  it('fails fast when song master charts are insufficient', async () => {
    const mock = createMockSeedEnvironment({ insufficientSelectableCharts: true });

    await expect(
      seedHomeFilterSamples({
        appDb: mock.appDb,
        opfs: mock.opfs,
        todayDate: '2026-03-01',
      }),
    ).rejects.toThrow(/Not enough selectable charts from song master/);
  });
});
