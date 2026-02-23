import { describe, expect, it, vi } from 'vitest';

import { AppDatabase } from '../src/app-db.js';
import { OpfsStorage } from '../src/opfs.js';
import { SqliteDbId, SqliteWorkerClient } from '../src/sqlite-client.js';

interface MockClientOptions {
  hasTitleQualifierColumn: boolean;
  songRows?: Array<Record<string, unknown>>;
  chartRows?: Array<Record<string, unknown>>;
  settings?: Record<string, string>;
}

class MockSqliteWorkerClient {
  constructor(private readonly options: MockClientOptions) {}

  readonly open = vi.fn(async ({ filename }: { filename: string }) => {
    if (filename.includes('song_master')) {
      return 2;
    }
    return 1;
  });

  readonly close = vi.fn(async (_dbId: SqliteDbId) => undefined);

  readonly exec = vi.fn(async (_input: { dbId: SqliteDbId; sql: string; bind?: unknown[] }) => undefined);

  readonly query = vi.fn(async (input: { dbId: SqliteDbId; sql: string; bind?: unknown[] }) => {
    const sql = input.sql;
    if (sql.includes('SELECT "key" as key, value FROM app_settings')) {
      const settings = this.options.settings ?? { song_master_file_name: 'song_master.sqlite' };
      return Object.entries(settings).map(([key, value]) => ({ key, value }));
    }
    if (sql.includes("PRAGMA table_info('music')")) {
      if (!this.options.hasTitleQualifierColumn) {
        return [{ cid: 0, name: 'music_id' }, { cid: 1, name: 'title' }];
      }
      return [
        { cid: 0, name: 'music_id' },
        { cid: 1, name: 'title' },
        { cid: 2, name: 'title_qualifier' },
      ];
    }
    if (sql.includes('FROM music')) {
      return this.options.songRows ?? [];
    }
    if (sql.includes('FROM chart c')) {
      return this.options.chartRows ?? [];
    }
    return [];
  });
}

class MockOpfsStorage {
  constructor(private readonly songMasterExists = true) {}

  readonly readFile = vi.fn(async (_relativePath: string) => {
    throw new Error('meta file not found');
  });

  readonly fileExists = vi.fn(async (_relativePath: string) => this.songMasterExists);
}

function createAppDb(options: MockClientOptions & { songMasterExists?: boolean }) {
  const client = new MockSqliteWorkerClient(options);
  const opfs = new MockOpfsStorage(options.songMasterExists ?? true);
  const appDb = new AppDatabase(client as unknown as SqliteWorkerClient, opfs as unknown as OpfsStorage);
  (appDb as unknown as { dbId: SqliteDbId | null }).dbId = 1;
  return { appDb, client };
}

describe('AppDatabase song title display', () => {
  it('shows title only when title_qualifier column is missing', async () => {
    const { appDb, client } = createAppDb({
      hasTitleQualifierColumn: false,
      songRows: [{ music_id: 1, title: 'IXION', version_code: '30' }],
    });

    const songs = await appDb.searchSongsByPrefix('ix', 30);

    expect(songs).toEqual([{ musicId: 1, title: 'IXION', version: '30' }]);
    const musicQuery = client.query.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg?.sql === 'string' && arg.sql.includes('FROM music'));
    expect(musicQuery?.sql).toContain("'' AS title_qualifier");
  });

  it('builds display title from title and title_qualifier with (AC) exception', async () => {
    const { appDb, client } = createAppDb({
      hasTitleQualifierColumn: true,
      songRows: [
        { music_id: 10, title: 'IXION', title_qualifier: '', version_code: '29' },
        { music_id: 11, title: 'MAX 300', title_qualifier: '(AC)', version_code: '13' },
        { music_id: 12, title: 'jelly kiss', title_qualifier: '(CS BEST)', version_code: '10' },
      ],
    });

    const songs = await appDb.searchSongsByPrefix('', 30);

    expect(songs).toEqual([
      { musicId: 10, title: 'IXION', version: '29' },
      { musicId: 11, title: 'MAX 300', version: '13' },
      { musicId: 12, title: 'jelly kiss(CS BEST)', version: '10' },
    ]);
    const musicQuery = client.query.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg?.sql === 'string' && arg.sql.includes('FROM music'));
    expect(musicQuery?.sql).toContain("COALESCE(title_qualifier, '') AS title_qualifier");
  });

  it('applies title_qualifier display rules to chart title lookup', async () => {
    const { appDb } = createAppDb({
      hasTitleQualifierColumn: true,
      chartRows: [
        {
          chart_id: 101,
          title: 'MAX 300',
          title_qualifier: '(AC)',
          play_style: 'SP',
          difficulty: 'HYPER',
          level: '10',
        },
        {
          chart_id: 102,
          title: 'jelly kiss',
          title_qualifier: '(CS BEST)',
          play_style: 'DP',
          difficulty: 'ANOTHER',
          level: '12',
        },
      ],
    });

    const charts = await appDb.listSongMasterChartsByIds([101, 102]);

    expect(charts).toEqual([
      {
        chartId: 101,
        title: 'MAX 300',
        playStyle: 'SP',
        difficulty: 'HYPER',
        level: '10',
      },
      {
        chartId: 102,
        title: 'jelly kiss(CS BEST)',
        playStyle: 'DP',
        difficulty: 'ANOTHER',
        level: '12',
      },
    ]);
  });
});
