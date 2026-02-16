import {
  AppDatabase,
  IdFactory,
  OpfsStorage,
  RuntimeClock,
  SongMasterService,
  SqliteWorkerClient,
  createSqliteWorkerClient,
} from '@iidx/db';

export interface AppServices {
  sqliteClient: SqliteWorkerClient;
  opfs: OpfsStorage;
  appDb: AppDatabase;
  songMasterService: SongMasterService;
}

export interface AppServiceOverrides {
  sqliteClient?: SqliteWorkerClient;
  opfs?: OpfsStorage;
  appDb?: AppDatabase;
  songMasterService?: SongMasterService;
  clock?: RuntimeClock;
  idFactory?: IdFactory;
  fetchImpl?: typeof fetch;
}

export async function createAppServices(overrides: AppServiceOverrides = {}): Promise<AppServices> {
  const sqliteClient = overrides.sqliteClient ?? (await createSqliteWorkerClient());
  const opfs = overrides.opfs ?? new OpfsStorage();
  const appDb =
    overrides.appDb ?? new AppDatabase(sqliteClient, opfs, overrides.clock, overrides.idFactory);

  await appDb.init();

  const songMasterOptions = {
    latestJsonUrl: import.meta.env.VITE_SONG_MASTER_LATEST_URL ?? '/song-master/latest.json',
    sqliteBaseUrl: import.meta.env.VITE_SONG_MASTER_BASE_URL ?? '/song-master',
    requiredSchemaVersion: Number(import.meta.env.VITE_SONG_MASTER_SCHEMA_VERSION ?? '1'),
    ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
  };

  const songMasterService =
    overrides.songMasterService ??
    new SongMasterService(appDb, sqliteClient, opfs, songMasterOptions);

  return {
    sqliteClient,
    opfs,
    appDb,
    songMasterService,
  };
}
