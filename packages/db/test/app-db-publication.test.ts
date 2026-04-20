import { createRequire } from 'node:module';

import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';

import { AppDatabase } from '../src/app-db.js';
import { OpfsStorage } from '../src/opfs.js';
import { SqliteDbId, SqliteWorkerClient } from '../src/sqlite-client.js';

const require = createRequire(import.meta.url);
const sqlWasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

async function loadSqlJs() {
  return initSqlJs({
    locateFile: (file: string) => {
      if (file === 'sql-wasm.wasm') {
        return sqlWasmPath;
      }
      return file;
    },
  });
}

class SqlJsWorkerClientMock {
  constructor(private readonly db: initSqlJs.Database) {}

  async open(_options: { filename: string }): Promise<SqliteDbId> {
    return 1;
  }

  async close(_dbId: SqliteDbId): Promise<void> {
    return;
  }

  async exec(input: { dbId: SqliteDbId; sql: string; bind?: unknown[] }): Promise<void> {
    if (input.bind && input.bind.length > 0) {
      this.db.run(input.sql, input.bind as any);
      return;
    }
    this.db.exec(input.sql);
  }

  async query<T extends Record<string, unknown>>(input: {
    dbId: SqliteDbId;
    sql: string;
    bind?: unknown[];
  }): Promise<T[]> {
    const statement =
      input.bind && input.bind.length > 0
        ? this.db.prepare(input.sql, input.bind as any)
        : this.db.prepare(input.sql);
    const rows: T[] = [];
    try {
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
    } finally {
      statement.free();
    }
    return rows;
  }
}

async function createAppDb(nowValues: string[]) {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  const client = new SqlJsWorkerClientMock(db);
  const clock = {
    nowIso: () => nowValues.shift() ?? '2026-04-20T23:59:59.000Z',
    todayJst: () => '2026-04-20',
  };
  const appDb = new AppDatabase(
    client as unknown as SqliteWorkerClient,
    {} as OpfsStorage,
    clock,
    { uuid: () => '33333333-3333-4333-8333-333333333333' },
  );
  await appDb.init();
  return { appDb, db };
}

describe('AppDatabase publication state', () => {
  it('stores published tournament metadata in list and detail views', async () => {
    const { appDb, db } = await createAppDb([
      '2026-04-20T10:00:00.000Z',
      '2026-04-20T10:05:00.000Z',
    ]);

    try {
      const tournamentUuid = await appDb.createTournament({
        tournamentName: '公開テスト',
        owner: '',
        hashtag: 'PUBLIC',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [101, 202],
        publicStatus: 'publishing',
      });

      await appDb.markTournamentPublished(tournamentUuid, 'public-001');

      const list = await appDb.listTournaments('active');
      const detail = await appDb.getTournamentDetail(tournamentUuid);

      expect(list[0]).toMatchObject({
        tournamentUuid,
        publicId: 'public-001',
        publicStatus: 'published',
        lastPublishAttemptAt: '2026-04-20T10:05:00.000Z',
      });
      expect(detail).toMatchObject({
        tournamentUuid,
        publicId: 'public-001',
        publicStatus: 'published',
        lastPublishAttemptAt: '2026-04-20T10:05:00.000Z',
      });
    } finally {
      db.close();
    }
  });

  it('marks tournament publication as retryable after a failed publish attempt', async () => {
    const { appDb, db } = await createAppDb([
      '2026-04-20T11:00:00.000Z',
      '2026-04-20T11:10:00.000Z',
      '2026-04-20T11:20:00.000Z',
    ]);

    try {
      const tournamentUuid = await appDb.createTournament({
        tournamentName: '再試行テスト',
        owner: '',
        hashtag: 'RETRY',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [303],
      });

      await appDb.markTournamentPublishing(tournamentUuid);
      await appDb.markTournamentPublishRetryable(tournamentUuid);

      const detail = await appDb.getTournamentDetail(tournamentUuid);
      expect(detail).toMatchObject({
        tournamentUuid,
        publicId: null,
        publicStatus: 'retryable',
        lastPublishAttemptAt: '2026-04-20T11:20:00.000Z',
      });
    } finally {
      db.close();
    }
  });

  it('reconciles interrupted publishing tournaments as retryable on startup', async () => {
    const { appDb, db } = await createAppDb([
      '2026-04-20T13:00:00.000Z',
      '2026-04-20T13:10:00.000Z',
    ]);

    try {
      const tournamentUuid = await appDb.createTournament({
        tournamentName: '中断公開テスト',
        owner: '',
        hashtag: 'RECOVER',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [505],
        publicStatus: 'publishing',
      });

      await appDb.reconcileInterruptedTournamentPublications();

      const detail = await appDb.getTournamentDetail(tournamentUuid);
      expect(detail).toMatchObject({
        tournamentUuid,
        publicId: null,
        publicStatus: 'retryable',
        lastPublishAttemptAt: '2026-04-20T13:00:00.000Z',
      });
    } finally {
      db.close();
    }
  });

  it('leaves settled publication states unchanged during interrupted publish reconciliation', async () => {
    const { appDb, db } = await createAppDb([
      '2026-04-20T14:00:00.000Z',
      '2026-04-20T14:05:00.000Z',
      '2026-04-20T14:10:00.000Z',
      '2026-04-20T14:15:00.000Z',
    ]);

    try {
      const unpublishedTournamentUuid = await appDb.createTournament({
        tournamentUuid: '44444444-4444-4444-8444-444444444444',
        tournamentName: '未公開大会',
        owner: '',
        hashtag: 'UNPUBLISHED',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [606],
      });
      const publishedTournamentUuid = await appDb.createTournament({
        tournamentUuid: '55555555-5555-4555-8555-555555555555',
        tournamentName: '公開済み大会',
        owner: '',
        hashtag: 'PUBLISHED',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [707],
      });
      await appDb.markTournamentPublished(publishedTournamentUuid, 'public-707');

      await appDb.reconcileInterruptedTournamentPublications();

      const unpublishedDetail = await appDb.getTournamentDetail(unpublishedTournamentUuid);
      const publishedDetail = await appDb.getTournamentDetail(publishedTournamentUuid);
      expect(unpublishedDetail).toMatchObject({
        tournamentUuid: unpublishedTournamentUuid,
        publicId: null,
        publicStatus: 'unpublished',
        lastPublishAttemptAt: null,
      });
      expect(publishedDetail).toMatchObject({
        tournamentUuid: publishedTournamentUuid,
        publicId: 'public-707',
        publicStatus: 'published',
        lastPublishAttemptAt: '2026-04-20T14:10:00.000Z',
      });
    } finally {
      db.close();
    }
  });

  it('rejects published updates without a usable publicId', async () => {
    const { appDb, db } = await createAppDb(['2026-04-20T12:00:00.000Z']);

    try {
      const tournamentUuid = await appDb.createTournament({
        tournamentName: 'invalid id',
        owner: '',
        hashtag: 'INVALID',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [404],
      });

      await expect(appDb.markTournamentPublished(tournamentUuid, '   ')).rejects.toThrow('publicId is required.');
    } finally {
      db.close();
    }
  });
});
