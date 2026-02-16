import {
  AppDatabase,
  OpfsStorage,
  RuntimeClock,
  SongMasterService,
  SqliteWorkerClient,
  createSqliteWorkerClient,
} from '@iidx/db';
import type { CreateSqliteWorkerClientOptions, IdFactory } from '@iidx/db';

import { resolveSongMasterRuntimeConfig } from './song-master-config';

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
  const workerUrl = `${import.meta.env.BASE_URL}sqlite/sqlite3-worker1.mjs`;
  const songMasterConfig = resolveSongMasterRuntimeConfig(import.meta.env);

  const sqliteClient =
    overrides.sqliteClient ??
    (await createSqliteWorkerClient(
      {
        worker: new Worker(workerUrl, { type: 'module' }),
      } satisfies CreateSqliteWorkerClientOptions,
    ));
  const opfs = overrides.opfs ?? new OpfsStorage();
  const appDb =
    overrides.appDb ?? new AppDatabase(sqliteClient, opfs, overrides.clock, overrides.idFactory);

  await appDb.init();

  const songMasterOptions = {
    latestJsonUrl: songMasterConfig.latestJsonUrl,
    sqliteBaseUrl: songMasterConfig.sqliteBaseUrl,
    requiredSchemaVersion: songMasterConfig.requiredSchemaVersion,
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
