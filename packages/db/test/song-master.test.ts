import { sha256Hex } from '@iidx/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('skips sqlite download when latest generated_at is not newer', async () => {
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
      last_song_master_generated_at: '2026-02-17T09:00:00.000+09:00',
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

  it('downloads sqlite when latest generated_at is newer', async () => {
    const sqliteBytes = createSqliteBytes();
    const sha256 = sha256Hex(sqliteBytes);
    const latest = {
      file_name: 'song_master_2026-02-17.sqlite',
      schema_version: 33,
      generated_at: '2026-02-17T00:00:01.000Z',
      sha256,
      byte_size: sqliteBytes.byteLength,
    };

    const latestJsonUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download/latest.json';
    const sqliteBaseUrl = 'https://github.com/tts1374/iidx_all_songs_master/releases/latest/download';
    const expectedSqliteUrl = `${sqliteBaseUrl}/${latest.file_name}`;

    const fetchCalls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url === latestJsonUrl) {
        return new Response(JSON.stringify(latest), { status: 200 });
      }
      if (url === expectedSqliteUrl) {
        return new Response(Uint8Array.from(sqliteBytes).buffer, { status: 200 });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const appDb = new MockAppDatabase(true, {
      last_song_master_generated_at: '2026-02-17T00:00:00.000Z',
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
    expect(result.source).toBe('github_download');
    expect(fetchCalls).toEqual([latestJsonUrl, expectedSqliteUrl]);
    expect(appDb.getSettingNow('last_song_master_generated_at')).toBe(latest.generated_at);
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

function createUpdateFixture(hasCache = true) {
  const bytes = createSqliteBytes();
  const latest = {
    file_name: 'song_master_new.sqlite',
    schema_version: 33,
    generated_at: '2026-10-22T00:00:00Z',
    sha256: sha256Hex(bytes),
    byte_size: bytes.byteLength,
  };
  const appDb = new MockAppDatabase(hasCache, hasCache ? {
    song_master_file_name: 'song_master_old.sqlite',
    last_song_master_generated_at: '2026-10-01T00:00:00Z',
  } : {});
  const client = new MockSqliteWorkerClient();
  const opfs = new MockOpfsStorage();
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
    String(input).endsWith('latest.json')
      ? new Response(JSON.stringify(latest))
      : new Response(Uint8Array.from(bytes).buffer),
  );
  const service = new SongMasterService(
    appDb as unknown as AppDatabase,
    client as unknown as SqliteWorkerClient,
    opfs as unknown as OpfsStorage,
    { latestJsonUrl: 'https://example.com/latest.json', sqliteBaseUrl: 'https://example.com/', requiredSchemaVersion: 33, fetchImpl },
  );
  return { latest, appDb, client, opfs, fetchImpl, service };
}

describe('automatic/manual update safety and progress', () => {
  it('notifies only after a compatible newer version is found and before downloading sqlite', async () => {
    const { service, fetchImpl, appDb } = createUpdateFixture();
    const onDownloadStart = vi.fn(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const result = await service.updateIfNeeded(false, onDownloadStart);
    expect(onDownloadStart).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('github_download');
    expect(appDb.getSettingNow('song_master_file_name')).toBe('song_master_new.sqlite');
  });

  it('does not notify or download sqlite when current, but permits force refetch', async () => {
    const { service, latest, fetchImpl, appDb } = createUpdateFixture();
    await appDb.setSetting('last_song_master_generated_at', latest.generated_at);
    const onDownloadStart = vi.fn();
    expect((await service.updateIfNeeded(false, onDownloadStart)).source).toBe('up_to_date');
    expect(onDownloadStart).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await service.updateIfNeeded(true, onDownloadStart)).source).toBe('github_download');
    expect(onDownloadStart).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('coalesces concurrent automatic and manual calls into one download and notification', async () => {
    const { service, fetchImpl } = createUpdateFixture(false);
    const onDownloadStart = vi.fn();
    const results = await Promise.all([
      service.updateIfNeeded(false, onDownloadStart),
      service.updateIfNeeded(true, onDownloadStart),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].source).toBe('initial_download');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onDownloadStart).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('handles network failure with cache=%s and allows retry', async (hasCache) => {
    const { service, fetchImpl, appDb, opfs } = createUpdateFixture(hasCache);
    fetchImpl.mockRejectedValueOnce(new Error('offline'));
    const result = await service.updateIfNeeded();
    expect(result.ok).toBe(hasCache);
    expect(result.source).toBe(hasCache ? 'local_cache' : 'initial_download');
    expect(result.message).toContain('network_error');
    expect(opfs.writeFileAtomic).not.toHaveBeenCalled();
    expect(appDb.getSettingNow('song_master_file_name')).toBe(hasCache ? 'song_master_old.sqlite' : undefined);
    expect((await service.updateIfNeeded()).ok).toBe(true);
  });

  it.each(['invalid JSON', 'empty JSON', 'schema mismatch', 'hash mismatch', 'size mismatch', 'sqlite invalid'])('%s does not replace cached metadata', async (failure) => {
    const { service, fetchImpl, latest, appDb, opfs, client } = createUpdateFixture();
    if (failure === 'invalid JSON') fetchImpl.mockResolvedValueOnce(new Response('{broken'));
    if (failure === 'empty JSON') fetchImpl.mockResolvedValueOnce(new Response('{}'));
    if (failure === 'schema mismatch') latest.schema_version = 999;
    if (failure === 'hash mismatch') latest.sha256 = '0'.repeat(64);
    if (failure === 'size mismatch') latest.byte_size += 1;
    if (failure === 'sqlite invalid') client.open.mockRejectedValueOnce(new Error('invalid sqlite'));
    const onDownloadStart = vi.fn();
    const result = await service.updateIfNeeded(false, onDownloadStart);
    expect(result.source).toBe(failure === 'schema mismatch' ? 'github_download' : 'local_cache');
    expect(result.message).toBeTruthy();
    expect(appDb.getSettingNow('song_master_file_name')).toBe('song_master_old.sqlite');
    expect(appDb.getSettingNow('last_song_master_generated_at')).toBe('2026-10-01T00:00:00Z');
    if (['invalid JSON', 'empty JSON', 'schema mismatch'].includes(failure)) {
      expect(onDownloadStart).not.toHaveBeenCalled();
    }
    if (failure !== 'sqlite invalid') expect(opfs.writeFileAtomic).not.toHaveBeenCalled();
  });
});

describe('song master request deadlines', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['latest.json', 'headers', true],
    ['latest.json', 'body', true],
    ['sqlite', 'headers', true],
    ['sqlite', 'body', true],
    ['latest.json', 'headers', false],
    ['latest.json', 'body', false],
    ['sqlite', 'headers', false],
    ['sqlite', 'body', false],
  ] as const)('bounds stalled %s %s with cache=%s, discards late data, and permits retry', async (target, stage, hasCache) => {
    vi.useFakeTimers();
    const { service, fetchImpl, latest, appDb, opfs } = createUpdateFixture(hasCache);
    const normalFetch = fetchImpl.getMockImplementation()!;
    let signal: AbortSignal | null | undefined;
    let release!: () => void;
    let shouldStall = true;
    fetchImpl.mockImplementation(async (input, init) => {
      const isLatest = String(input).endsWith('latest.json');
      if (!shouldStall || isLatest !== (target === 'latest.json')) {
        return normalFetch(input, init);
      }
      shouldStall = false;
      signal = init?.signal;
      const bytes = isLatest ? new TextEncoder().encode(JSON.stringify(latest)) : createSqliteBytes();
      // Deliberately ignore AbortSignal, so a late response must also be harmless.
      if (stage === 'headers') {
        return new Promise<Response>((resolve) => {
          release = () => resolve(new Response(Uint8Array.from(bytes).buffer));
        });
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          release = () => { controller.enqueue(bytes); controller.close(); };
        },
      });
      return new Response(body);
    });
    let settled = false;
    const task = service.updateIfNeeded().then((result) => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    expect(signal?.aborted).toBe(true);
    const result = await task;
    expect(result.ok).toBe(hasCache);
    expect(result.source).toBe(hasCache ? 'local_cache' : 'initial_download');
    expect(result.message).toContain('network_error');
    expect(result.message).toContain('timed out');
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(opfs.writeFileAtomic).not.toHaveBeenCalled();
    expect(appDb.getSettingNow('song_master_file_name')).toBe(hasCache ? 'song_master_old.sqlite' : undefined);
    expect((await service.updateIfNeeded()).source).toBe(hasCache ? 'github_download' : 'initial_download');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears request deadlines after a successful update', async () => {
    vi.useFakeTimers();
    const { service } = createUpdateFixture();
    expect((await service.updateIfNeeded()).source).toBe('github_download');
    expect(vi.getTimerCount()).toBe(0);
  });
});
