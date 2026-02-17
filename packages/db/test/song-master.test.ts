import { sha256Hex } from '@iidx/shared';
import { describe, expect, it, vi } from 'vitest';

import { AppDatabase } from '../src/app-db.js';
import { OpfsStorage } from '../src/opfs.js';
import { SongMasterService } from '../src/song-master.js';
import { SqliteWorkerClient } from '../src/sqlite-client.js';

class MockAppDatabase {
  private readonly settings = new Map<string, string>();

  constructor(
    private readonly hasCache: boolean,
    initialMeta: Record<string, string | null> = {},
  ) {
    for (const [key, value] of Object.entries(initialMeta)) {
      if (typeof value === 'string') {
        this.settings.set(key, value);
      }
    }
  }

  async hasSongMaster(): Promise<boolean> {
    return this.hasCache;
  }

  async getSongMasterMeta(): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    for (const [key, value] of this.settings.entries()) {
      result[key] = value;
    }
    return result;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }

  getSettingNow(key: string): string | undefined {
    return this.settings.get(key);
  }
}

class MockSqliteWorkerClient {
  readonly open = vi.fn(async () => 1);
  readonly query = vi.fn(async () => [{ one: 1 }]);
  readonly close = vi.fn(async () => undefined);
}

class MockOpfsStorage {
  readonly files = new Map<string, Uint8Array>();

  readonly writeFileAtomic = vi.fn(
    async (
      relativePath: string,
      bytes: Uint8Array,
      options?: {
        validate?: (bytes: Uint8Array) => Promise<void>;
      },
    ) => {
      if (options?.validate) {
        await options.validate(bytes);
      }
      this.files.set(relativePath, new Uint8Array(bytes));
    },
  );
}

function createSqliteBytes(): Uint8Array {
  const header = new TextEncoder().encode('SQLite format 3\u0000');
  const payload = new TextEncoder().encode('fixture-data-for-song-master');
  const bytes = new Uint8Array(header.length + payload.length);
  bytes.set(header, 0);
  bytes.set(payload, header.length);
  return bytes;
}

describe('SongMasterService', () => {
  it('downloads latest json and sqlite via releases/latest/download with no-store', async () => {
    const sqliteBytes = createSqliteBytes();
    const sha256 = sha256Hex(sqliteBytes);
    const latest = {
      file_name: 'song_master_2026-02-17.sqlite',
      schema_version: 33,
      generated_at: '2026-02-17T00:00:00.000Z',
      sha256,
      byte_size: sqliteBytes.byteLength,
    };

    const latestJsonUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download/latest.json';
    const sqliteBaseUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download';
    const expectedSqliteUrl = `${sqliteBaseUrl}/${latest.file_name}`;

    const fetchCalls: Array<{ url: string; cache: RequestCache | undefined }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      fetchCalls.push({
        url,
        cache: init?.cache,
      });
      if (url === latestJsonUrl) {
        return new Response(JSON.stringify(latest), { status: 200 });
      }
      if (url === expectedSqliteUrl) {
        return new Response(Uint8Array.from(sqliteBytes).buffer, { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const appDb = new MockAppDatabase(false);
    const client = new MockSqliteWorkerClient();
    const opfs = new MockOpfsStorage();

    const service = new SongMasterService(
      appDb as unknown as AppDatabase,
      client as unknown as SqliteWorkerClient,
      opfs as unknown as OpfsStorage,
      {
        latestJsonUrl,
        sqliteBaseUrl,
        requiredSchemaVersion: 33,
        fetchImpl: fetchImpl as typeof fetch,
      },
    );

    const result = await service.updateIfNeeded(false);
    expect(result.ok).toBe(true);
    expect(result.source).toBe('initial_download');
    expect(fetchCalls).toEqual([
      { url: latestJsonUrl, cache: 'no-store' },
      { url: expectedSqliteUrl, cache: 'no-store' },
    ]);
    expect(opfs.files.has(`song_master/${latest.file_name}`)).toBe(true);
    expect(opfs.files.has('song_master/latest_meta.json')).toBe(true);
    expect(appDb.getSettingNow('last_song_master_sha256')).toBe(sha256);
    expect(appDb.getSettingNow('last_song_master_byte_size')).toBe(String(sqliteBytes.byteLength));
    expect(appDb.getSettingNow('last_song_master_generated_at')).toBe(latest.generated_at);
  });

  it('skips sqlite download when sha256 and byte_size are unchanged', async () => {
    const sqliteBytes = createSqliteBytes();
    const sha256 = sha256Hex(sqliteBytes);
    const latest = {
      file_name: 'song_master_2026-02-17.sqlite',
      schema_version: 33,
      generated_at: '2026-02-17T00:00:00.000Z',
      sha256,
      byte_size: sqliteBytes.byteLength,
    };

    const latestJsonUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download/latest.json';
    const sqliteBaseUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download';
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(latest), { status: 200 }));
    const appDb = new MockAppDatabase(true, {
      last_song_master_sha256: sha256,
      last_song_master_byte_size: String(sqliteBytes.byteLength),
      song_master_file_name: latest.file_name,
    });
    const client = new MockSqliteWorkerClient();
    const opfs = new MockOpfsStorage();

    const service = new SongMasterService(
      appDb as unknown as AppDatabase,
      client as unknown as SqliteWorkerClient,
      opfs as unknown as OpfsStorage,
      {
        latestJsonUrl,
        sqliteBaseUrl,
        requiredSchemaVersion: 33,
        fetchImpl: fetchImpl as typeof fetch,
      },
    );

    const result = await service.updateIfNeeded(false);
    expect(result.ok).toBe(true);
    expect(result.source).toBe('up_to_date');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(opfs.writeFileAtomic).not.toHaveBeenCalled();
  });

  it('keeps local cache when sqlite integrity validation fails after initial cache exists', async () => {
    const sqliteBytes = createSqliteBytes();
    const wrongSha = 'a'.repeat(64);
    const latest = {
      file_name: 'song_master_2026-02-17.sqlite',
      schema_version: 33,
      generated_at: '2026-02-17T00:00:00.000Z',
      sha256: wrongSha,
      byte_size: sqliteBytes.byteLength,
    };

    const latestJsonUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download/latest.json';
    const sqliteBaseUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download';
    const expectedSqliteUrl = `${sqliteBaseUrl}/${latest.file_name}`;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === latestJsonUrl) {
        return new Response(JSON.stringify(latest), { status: 200 });
      }
      if (url === expectedSqliteUrl) {
        return new Response(Uint8Array.from(sqliteBytes).buffer, { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const appDb = new MockAppDatabase(true, {
      last_song_master_sha256: 'b'.repeat(64),
      last_song_master_byte_size: String(sqliteBytes.byteLength),
      song_master_file_name: latest.file_name,
    });
    const client = new MockSqliteWorkerClient();
    const opfs = new MockOpfsStorage();

    const service = new SongMasterService(
      appDb as unknown as AppDatabase,
      client as unknown as SqliteWorkerClient,
      opfs as unknown as OpfsStorage,
      {
        latestJsonUrl,
        sqliteBaseUrl,
        requiredSchemaVersion: 33,
        fetchImpl: fetchImpl as typeof fetch,
      },
    );

    const result = await service.updateIfNeeded(false);
    expect(result.ok).toBe(true);
    expect(result.source).toBe('local_cache');
    expect(result.message).toContain('integrity_mismatch');
    expect(opfs.writeFileAtomic).not.toHaveBeenCalled();
  });
});
