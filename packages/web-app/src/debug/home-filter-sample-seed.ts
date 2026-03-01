import type { AppDatabase, ChartSummary, OpfsStorage, TournamentListItem, TournamentTab } from '@iidx/db';
import { PAYLOAD_VERSION, normalizeHashtag, sha256Hex, type TournamentPayload } from '@iidx/shared';

const HOME_FILTER_SAMPLE_HASHTAG = 'FILTER_SAMPLE';
const HOME_FILTER_SAMPLE_OWNER = 'sample-bot';
const SAMPLE_IMAGE_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OFQ8PFSsdFR0rKystKy0rKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrKysrK//AABEIAAEAAQMBIgACEQEDEQH/xAAbAAADAQEBAQEAAAAAAAAAAAAABQYDBEcCAf/EADUQAAIBAgQDBgQEBwAAAAAAAAECEQADBBIhMQVBUQYiYXGBEzKRobHR8EJScoKS4SNDU3L/xAAaAQADAQEBAQAAAAAAAAAAAAABAgMABAUH/8QAKREAAgICAgEDBAMBAAAAAAAAAAECEQMhEjEEE0FRImFxgZGhsfAUMkL/2gAMAwEAAhEDEQA/ANxREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREA//9k=';

type SampleTournamentState = 'active' | 'upcoming' | 'ended';
type SampleTournamentSource = 'created' | 'imported';
type SampleCategory = 'pending' | 'completed';

interface HomeFilterSampleDefinition {
  key: string;
  name: string;
  source: SampleTournamentSource;
  state: SampleTournamentState;
  chartIds: number[];
  sharedChartIndexes: number[];
  unsharedChartIndexes: number[];
  startDate: string;
  endDate: string;
}

interface HomeFilterSampleTemplate {
  key: string;
  name: string;
  source: SampleTournamentSource;
  state: SampleTournamentState;
  chartCount: number;
  sharedChartIndexes: number[];
  unsharedChartIndexes: number[];
}

export interface HomeFilterSampleSeedItem {
  key: string;
  name: string;
  tournamentUuid: string;
  source: SampleTournamentSource;
  state: SampleTournamentState;
  chartCount: number;
  submittedCount: number;
  sendWaitingCount: number;
  category: SampleCategory;
}

export interface HomeFilterSampleSeedResult {
  deletedSampleCount: number;
  createdSampleCount: number;
  created: HomeFilterSampleSeedItem[];
}

export interface HomeFilterSampleClearResult {
  deletedSampleCount: number;
}

interface HomeFilterSampleSeedOptions {
  appDb: AppDatabase;
  opfs: OpfsStorage;
  todayDate: string;
  resetExisting?: boolean;
}

const SONG_SEARCH_LIMIT = 120;
const SAMPLE_SEED_VALIDATION_BACKDATE_DAYS = -30;

interface RegisterHomeFilterSampleDebugApiOptions {
  enabled: boolean;
  appDb: AppDatabase;
  opfs: OpfsStorage;
  todayDate: string;
  onDataChanged?: () => Promise<void> | void;
}

type SeedHomeFilterSamplesFn = (options?: { resetExisting?: boolean }) => Promise<HomeFilterSampleSeedResult>;
type ClearHomeFilterSamplesFn = () => Promise<HomeFilterSampleClearResult>;

interface IidxDebugApi {
  seedHomeFilterSamples?: SeedHomeFilterSamplesFn;
  clearHomeFilterSamples?: ClearHomeFilterSamplesFn;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __IIDX_DEBUG__?: IidxDebugApi;
  }
}

function addDays(dateText: string, days: number): string {
  const base = new Date(`${dateText}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

interface AppDatabaseClockAccessor {
  clock?: {
    todayJst?: () => string;
  };
}

async function withTemporaryAppDatabaseToday<T>(
  appDb: AppDatabase,
  temporaryTodayDate: string,
  operation: () => Promise<T>,
): Promise<T> {
  const accessor = appDb as unknown as AppDatabaseClockAccessor;
  const clock = accessor.clock;
  if (!clock || typeof clock.todayJst !== 'function') {
    return operation();
  }
  const originalTodayJst = clock.todayJst;
  clock.todayJst = () => temporaryTodayDate;
  try {
    return await operation();
  } finally {
    clock.todayJst = originalTodayJst;
  }
}

function resolveStatePeriod(state: SampleTournamentState, todayDate: string): { startDate: string; endDate: string } {
  if (state === 'active') {
    return {
      startDate: addDays(todayDate, -4),
      endDate: addDays(todayDate, 6),
    };
  }
  if (state === 'upcoming') {
    return {
      startDate: addDays(todayDate, 2),
      endDate: addDays(todayDate, 10),
    };
  }
  return {
    startDate: addDays(todayDate, -12),
    endDate: addDays(todayDate, -2),
  };
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function indexesToChartIds(chartIds: number[], indexes: number[]): number[] {
  const result: number[] = [];
  indexes.forEach((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= chartIds.length) {
      throw new Error(`Invalid sample chart index: ${index}`);
    }
    const chartId = chartIds[index];
    if (chartId === undefined) {
      throw new Error(`Chart ID not found for sample index: ${index}`);
    }
    result.push(chartId);
  });
  return result;
}

function dedupeByTournamentUuid(items: TournamentListItem[]): TournamentListItem[] {
  const map = new Map<string, TournamentListItem>();
  items.forEach((item) => {
    map.set(item.tournamentUuid, item);
  });
  return Array.from(map.values());
}

async function listAllTournaments(appDb: AppDatabase): Promise<TournamentListItem[]> {
  const tabs: TournamentTab[] = ['active', 'upcoming', 'ended'];
  const rows = await Promise.all(tabs.map((tab) => appDb.listTournaments(tab)));
  return dedupeByTournamentUuid(rows.flat());
}

function isSampleTournament(item: TournamentListItem): boolean {
  return normalizeHashtag(item.hashtag) === HOME_FILTER_SAMPLE_HASHTAG;
}

function buildSampleTemplate(): HomeFilterSampleTemplate[] {
  const templates: HomeFilterSampleTemplate[] = [
    {
      key: 'created-active-pending-send-waiting',
      name: 'SAMPLE Created Active Pending SendWaiting',
      source: 'created',
      state: 'active',
      chartCount: 3,
      sharedChartIndexes: [],
      unsharedChartIndexes: [0],
    },
    {
      key: 'created-active-completed-shared',
      name: 'SAMPLE Created Active Completed Shared',
      source: 'created',
      state: 'active',
      chartCount: 2,
      sharedChartIndexes: [0, 1],
      unsharedChartIndexes: [],
    },
    {
      key: 'imported-active-completed-send-waiting',
      name: 'SAMPLE Imported Active Completed SendWaiting',
      source: 'imported',
      state: 'active',
      chartCount: 2,
      sharedChartIndexes: [0],
      unsharedChartIndexes: [1],
    },
    {
      key: 'imported-upcoming-pending-unregistered',
      name: 'SAMPLE Imported Upcoming Pending Unregistered',
      source: 'imported',
      state: 'upcoming',
      chartCount: 3,
      sharedChartIndexes: [],
      unsharedChartIndexes: [],
    },
    {
      key: 'created-upcoming-completed-shared',
      name: 'SAMPLE Created Upcoming Completed Shared',
      source: 'created',
      state: 'upcoming',
      chartCount: 1,
      sharedChartIndexes: [0],
      unsharedChartIndexes: [],
    },
    {
      key: 'created-upcoming-pending-shared',
      name: 'SAMPLE Created Upcoming Pending Shared',
      source: 'created',
      state: 'upcoming',
      chartCount: 2,
      sharedChartIndexes: [0],
      unsharedChartIndexes: [],
    },
    {
      key: 'imported-ended-pending-send-waiting',
      name: 'SAMPLE Imported Ended Pending SendWaiting',
      source: 'imported',
      state: 'ended',
      chartCount: 2,
      sharedChartIndexes: [],
      unsharedChartIndexes: [0],
    },
    {
      key: 'created-ended-completed-send-waiting',
      name: 'SAMPLE Created Ended Completed SendWaiting',
      source: 'created',
      state: 'ended',
      chartCount: 2,
      sharedChartIndexes: [0],
      unsharedChartIndexes: [1],
    },
    {
      key: 'imported-ended-completed-shared',
      name: 'SAMPLE Imported Ended Completed Shared',
      source: 'imported',
      state: 'ended',
      chartCount: 1,
      sharedChartIndexes: [0],
      unsharedChartIndexes: [],
    },
  ];
  return templates;
}

function countRequiredCharts(templates: HomeFilterSampleTemplate[]): number {
  return templates.reduce((total, template) => total + template.chartCount, 0);
}

function buildFallbackChartPool(requiredCount: number): number[] {
  return Array.from({ length: requiredCount }, (_, index) => 810001 + index);
}

function assignChartsToTemplates(
  templates: HomeFilterSampleTemplate[],
  chartPool: number[],
  todayDate: string,
): HomeFilterSampleDefinition[] {
  const requiredCount = countRequiredCharts(templates);
  if (chartPool.length < requiredCount) {
    throw new Error(`Insufficient chart IDs for sample seed. required=${requiredCount}, got=${chartPool.length}`);
  }

  let cursor = 0;
  return templates.map((template) => {
    const chartIds = chartPool.slice(cursor, cursor + template.chartCount);
    cursor += template.chartCount;
    const period = resolveStatePeriod(template.state, todayDate);
    return {
      ...template,
      chartIds,
      startDate: period.startDate,
      endDate: period.endDate,
    };
  });
}

export function buildHomeFilterSampleDefinitions(todayDate: string): HomeFilterSampleDefinition[] {
  const templates = buildSampleTemplate();
  const fallbackChartPool = buildFallbackChartPool(countRequiredCharts(templates));
  return assignChartsToTemplates(templates, fallbackChartPool, todayDate);
}

function isSelectableChart(chart: ChartSummary): boolean {
  if (!Number.isInteger(chart.chartId) || chart.chartId <= 0) {
    return false;
  }
  if (chart.isActive !== 1) {
    return false;
  }
  const levelText = String(chart.level ?? '').trim();
  return levelText.length > 0 && levelText !== '0' && levelText !== '-';
}

async function collectSongMasterChartPool(appDb: AppDatabase, requiredCount: number): Promise<number[]> {
  const songs = await appDb.searchSongsByPrefix('', SONG_SEARCH_LIMIT);
  if (songs.length === 0) {
    throw new Error('Song master is required to seed home filter samples. No songs found.');
  }

  const chartPool: number[] = [];
  const seen = new Set<number>();
  for (const song of songs) {
    const [spCharts, dpCharts] = await Promise.all([
      appDb.getChartsByMusicAndStyle(song.musicId, 'SP'),
      appDb.getChartsByMusicAndStyle(song.musicId, 'DP'),
    ]);
    [...spCharts, ...dpCharts]
      .filter(isSelectableChart)
      .forEach((chart) => {
        if (seen.has(chart.chartId)) {
          return;
        }
        seen.add(chart.chartId);
        chartPool.push(chart.chartId);
      });
    if (chartPool.length >= requiredCount) {
      break;
    }
  }

  if (chartPool.length < requiredCount) {
    throw new Error(
      `Not enough selectable charts from song master. required=${requiredCount}, available=${chartPool.length}`,
    );
  }
  return chartPool;
}

async function buildHomeFilterSampleDefinitionsFromSongMaster(
  appDb: AppDatabase,
  todayDate: string,
): Promise<HomeFilterSampleDefinition[]> {
  const templates = buildSampleTemplate();
  const requiredCount = countRequiredCharts(templates);
  const chartPool = await collectSongMasterChartPool(appDb, requiredCount);
  return assignChartsToTemplates(templates, chartPool, todayDate);
}

async function createSampleTournament(
  appDb: AppDatabase,
  definition: HomeFilterSampleDefinition,
): Promise<string> {
  if (definition.source === 'created') {
    return appDb.createTournament({
      tournamentName: definition.name,
      owner: HOME_FILTER_SAMPLE_OWNER,
      hashtag: HOME_FILTER_SAMPLE_HASHTAG,
      startDate: definition.startDate,
      endDate: definition.endDate,
      chartIds: definition.chartIds,
    });
  }

  const payload: TournamentPayload = {
    v: PAYLOAD_VERSION,
    uuid: crypto.randomUUID(),
    name: definition.name,
    owner: HOME_FILTER_SAMPLE_OWNER,
    hashtag: HOME_FILTER_SAMPLE_HASHTAG,
    start: definition.startDate,
    end: definition.endDate,
    charts: definition.chartIds,
  };
  const imported = await appDb.importTournament(payload);
  return imported.tournamentUuid;
}

async function upsertEvidenceSet(
  appDb: AppDatabase,
  opfs: OpfsStorage,
  tournamentUuid: string,
  chartIds: number[],
  imageBytes: Uint8Array,
  sha256: string,
): Promise<void> {
  for (const chartId of chartIds) {
    const relativePath = await appDb.getEvidenceRelativePath(tournamentUuid, chartId);
    await opfs.writeFileAtomic(relativePath, imageBytes);
    await appDb.upsertEvidenceMetadata({
      tournamentUuid,
      chartId,
      sha256,
      width: 1,
      height: 1,
    });
  }
}

function toSampleItem(definition: HomeFilterSampleDefinition, tournamentUuid: string): HomeFilterSampleSeedItem {
  const submittedCount = definition.sharedChartIndexes.length + definition.unsharedChartIndexes.length;
  const sendWaitingCount = definition.unsharedChartIndexes.length;
  return {
    key: definition.key,
    name: definition.name,
    tournamentUuid,
    source: definition.source,
    state: definition.state,
    chartCount: definition.chartIds.length,
    submittedCount,
    sendWaitingCount,
    category: submittedCount === definition.chartIds.length ? 'completed' : 'pending',
  };
}

async function validateSeededTournaments(
  appDb: AppDatabase,
  created: HomeFilterSampleSeedItem[],
): Promise<void> {
  let hasNoEvidenceChart = false;
  let hasUnsharedEvidenceChart = false;
  let hasSharedEvidenceChart = false;

  for (const entry of created) {
    const detail = await appDb.getTournamentDetail(entry.tournamentUuid);
    if (!detail) {
      throw new Error(`Sample tournament detail not found: ${entry.tournamentUuid}`);
    }
    const unresolved = detail.charts.filter((chart) => chart.resolveIssue !== null);
    if (unresolved.length > 0) {
      throw new Error(
        `Sample tournament has unresolved charts (${entry.tournamentUuid}): ${unresolved
          .map((chart) => String(chart.chartId))
          .join(', ')}`,
      );
    }

    detail.charts.forEach((chart) => {
      const localSaved = chart.updateSeq > 0 && !chart.fileDeleted;
      if (!localSaved) {
        hasNoEvidenceChart = true;
        return;
      }
      if (chart.needsSend) {
        hasUnsharedEvidenceChart = true;
        return;
      }
      hasSharedEvidenceChart = true;
    });
  }

  if (!hasNoEvidenceChart) {
    throw new Error('Sample seed validation failed: no chart available for first-time submission flow.');
  }
  if (!hasUnsharedEvidenceChart) {
    throw new Error('Sample seed validation failed: no chart available for unshared submission flow.');
  }
  if (!hasSharedEvidenceChart) {
    throw new Error('Sample seed validation failed: no chart available for shared/resubmit flow.');
  }
}

export async function clearHomeFilterSamples(appDb: AppDatabase): Promise<HomeFilterSampleClearResult> {
  const all = await listAllTournaments(appDb);
  const targets = all.filter((item) => isSampleTournament(item));
  for (const item of targets) {
    await appDb.deleteTournament(item.tournamentUuid);
  }
  return { deletedSampleCount: targets.length };
}

export async function seedHomeFilterSamples(options: HomeFilterSampleSeedOptions): Promise<HomeFilterSampleSeedResult> {
  const {
    appDb,
    opfs,
    todayDate,
    resetExisting = true,
  } = options;

  let deletedSampleCount = 0;
  if (resetExisting) {
    const cleared = await clearHomeFilterSamples(appDb);
    deletedSampleCount = cleared.deletedSampleCount;
  }

  const definitions = await buildHomeFilterSampleDefinitionsFromSongMaster(appDb, todayDate);
  const imageBytes = decodeBase64(SAMPLE_IMAGE_BASE64);
  const imageSha256 = sha256Hex(imageBytes);
  const created: HomeFilterSampleSeedItem[] = [];
  const seedValidationTodayDate = addDays(todayDate, SAMPLE_SEED_VALIDATION_BACKDATE_DAYS);

  await withTemporaryAppDatabaseToday(appDb, seedValidationTodayDate, async () => {
    for (const definition of definitions) {
      const tournamentUuid = await createSampleTournament(appDb, definition);
      const sharedChartIds = indexesToChartIds(definition.chartIds, definition.sharedChartIndexes);
      const unsharedChartIds = indexesToChartIds(definition.chartIds, definition.unsharedChartIndexes);
      const evidenceTargets = [...sharedChartIds, ...unsharedChartIds];

      await upsertEvidenceSet(appDb, opfs, tournamentUuid, evidenceTargets, imageBytes, imageSha256);
      if (sharedChartIds.length > 0) {
        await appDb.markEvidenceSendCompleted(tournamentUuid, sharedChartIds);
      }
      created.push(toSampleItem(definition, tournamentUuid));
    }
  });

  await validateSeededTournaments(appDb, created);

  return {
    deletedSampleCount,
    createdSampleCount: created.length,
    created,
  };
}

export function registerHomeFilterSampleDebugApi(options: RegisterHomeFilterSampleDebugApiOptions): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const seedFn: SeedHomeFilterSamplesFn = async (seedOptions) => {
    const result = await seedHomeFilterSamples({
      appDb: options.appDb,
      opfs: options.opfs,
      todayDate: options.todayDate,
      ...(seedOptions?.resetExisting === undefined ? {} : { resetExisting: seedOptions.resetExisting }),
    });
    if (options.onDataChanged) {
      await Promise.resolve(options.onDataChanged());
    }
    return result;
  };

  const clearFn: ClearHomeFilterSamplesFn = async () => {
    const result = await clearHomeFilterSamples(options.appDb);
    if (options.onDataChanged) {
      await Promise.resolve(options.onDataChanged());
    }
    return result;
  };

  const currentApi: IidxDebugApi = { ...(window.__IIDX_DEBUG__ ?? {}) };
  if (options.enabled) {
    currentApi.seedHomeFilterSamples = seedFn;
    currentApi.clearHomeFilterSamples = clearFn;
  } else {
    delete currentApi.seedHomeFilterSamples;
    delete currentApi.clearHomeFilterSamples;
  }

  if (Object.keys(currentApi).length === 0) {
    delete window.__IIDX_DEBUG__;
  } else {
    window.__IIDX_DEBUG__ = currentApi;
  }

  return () => {
    const activeApi = window.__IIDX_DEBUG__;
    if (!activeApi) {
      return;
    }
    if (activeApi.seedHomeFilterSamples === seedFn) {
      delete activeApi.seedHomeFilterSamples;
    }
    if (activeApi.clearHomeFilterSamples === clearFn) {
      delete activeApi.clearHomeFilterSamples;
    }
    if (Object.keys(activeApi).length === 0) {
      delete window.__IIDX_DEBUG__;
    }
  };
}
