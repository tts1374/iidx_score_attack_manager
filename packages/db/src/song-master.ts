import { sha256Hex } from '@iidx/shared';

import { AppDatabase } from './app-db.js';
import { SongMasterLatest } from './models.js';
import { OpfsStorage } from './opfs.js';
import { SqliteWorkerClient } from './sqlite-client.js';

export type SongMasterUpdateSource =
  | 'initial_download'
  | 'github_download'
  | 'local_cache'
  | 'up_to_date';

export interface SongMasterUpdateResult {
  ok: boolean;
  source: SongMasterUpdateSource;
  message?: string;
  latest?: SongMasterLatest;
}

export interface SongMasterServiceOptions {
  latestJsonUrl: string;
  sqliteBaseUrl: string;
  requiredSchemaVersion: number;
  fetchImpl?: typeof fetch;
}

const SONG_MASTER_DIR = 'song_master';
const SONG_MASTER_META_FILE = `${SONG_MASTER_DIR}/latest_meta.json`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseLatestJsonText(rawText: string, latestJsonUrl: string): Record<string, unknown> {
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const preview = rawText.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(
      `latest.json がJSONではありません。URL=${latestJsonUrl} preview="${preview}" ` +
        `VITE_SONG_MASTER_LATEST_URL を正しい latest.json に設定してください。`,
    );
  }
}

export class SongMasterService {
  private readonly fetchImpl: typeof fetch;
  private updateInFlight: Promise<SongMasterUpdateResult> | null = null;

  constructor(
    private readonly appDb: AppDatabase,
    private readonly client: SqliteWorkerClient,
    private readonly opfs: OpfsStorage,
    private readonly options: SongMasterServiceOptions,
  ) {
    const rawFetch = options.fetchImpl ?? globalThis.fetch;
    if (!rawFetch) {
      throw new Error('Fetch API is not available.');
    }
    this.fetchImpl = rawFetch.bind(globalThis) as typeof fetch;
  }

  async updateIfNeeded(force = false): Promise<SongMasterUpdateResult> {
    if (this.updateInFlight) {
      return this.updateInFlight;
    }

    const task = this.runUpdateIfNeeded(force).finally(() => {
      if (this.updateInFlight === task) {
        this.updateInFlight = null;
      }
    });
    this.updateInFlight = task;
    return task;
  }

  private async runUpdateIfNeeded(force = false): Promise<SongMasterUpdateResult> {
    const hasCache = await this.appDb.hasSongMaster();
    let latest: SongMasterLatest;

    try {
      latest = await this.fetchLatest();
    } catch (error) {
      if (!hasCache) {
        return {
          ok: false,
          source: 'initial_download',
          message: `曲マスタ初回取得に失敗しました: ${String(error)}`,
        };
      }
      return {
        ok: true,
        source: 'local_cache',
        message: '曲マスタ更新確認に失敗したためローカルキャッシュを利用します。',
      };
    }

    if (latest.schema_version !== this.options.requiredSchemaVersion) {
      return {
        ok: false,
        source: 'github_download',
        message: `schema_versionが不一致です。required=${this.options.requiredSchemaVersion}, latest=${latest.schema_version}`,
      };
    }

    const cachedMeta = await this.appDb.getSongMasterMeta();
    const fileNameChanged = cachedMeta.song_master_file_name !== latest.file_name;
    const hashChanged = cachedMeta.song_master_sha256 !== latest.sha256;
    const schemaChanged = cachedMeta.song_master_schema_version !== String(latest.schema_version);
    const updatedAtChanged = (latest.updated_at ?? '') !== (cachedMeta.song_master_updated_at ?? '');

    const needDownload = force || !hasCache || fileNameChanged || hashChanged || schemaChanged || updatedAtChanged;
    if (!needDownload) {
      return {
        ok: true,
        source: 'up_to_date',
        latest,
      };
    }

    const downloadUrl = latest.download_url ?? `${this.options.sqliteBaseUrl.replace(/\/$/, '')}/${latest.file_name}`;
    const bytes = await this.downloadAndVerify(downloadUrl, latest);

    const relativePath = `${SONG_MASTER_DIR}/${latest.file_name}`;
    await this.opfs.writeFileAtomic(relativePath, bytes, {
      validate: async (data) => {
        const header = new TextDecoder().decode(data.slice(0, 16));
        if (!header.startsWith('SQLite format 3')) {
          throw new Error('downloaded file is not sqlite');
        }
      },
    });

    await this.validateSqliteOpen(latest.file_name);

    const now = new Date().toISOString();
    await this.persistMetaFile(latest, now);

    let settingsWriteError: string | null = null;
    try {
      await this.appDb.setSetting('song_master_file_name', latest.file_name);
      await this.appDb.setSetting('song_master_schema_version', String(latest.schema_version));
      await this.appDb.setSetting('song_master_sha256', latest.sha256);
      await this.appDb.setSetting('song_master_byte_size', String(latest.byte_size));
      await this.appDb.setSetting('song_master_updated_at', latest.updated_at ?? '');
      await this.appDb.setSetting('song_master_downloaded_at', now);
    } catch (error) {
      settingsWriteError = error instanceof Error ? error.message : String(error);
    }

    let savedMeta = await this.appDb.getSongMasterMeta();
    let metaPersisted =
      String(savedMeta.song_master_file_name ?? '') === latest.file_name &&
      String(savedMeta.song_master_schema_version ?? '') === String(latest.schema_version) &&
      String(savedMeta.song_master_sha256 ?? '') === latest.sha256;
    for (let attempt = 0; attempt < 3 && !metaPersisted; attempt += 1) {
      await sleep(25 * (attempt + 1));
      savedMeta = await this.appDb.getSongMasterMeta();
      metaPersisted =
        String(savedMeta.song_master_file_name ?? '') === latest.file_name &&
        String(savedMeta.song_master_schema_version ?? '') === String(latest.schema_version) &&
        String(savedMeta.song_master_sha256 ?? '') === latest.sha256;
    }
    if (!metaPersisted) {
      throw new Error(
        `曲マスタメタデータの保存確認に失敗しました。expected=${JSON.stringify({
          file_name: latest.file_name,
          schema_version: String(latest.schema_version),
          sha256: latest.sha256,
        })} actual=${JSON.stringify({
          file_name: savedMeta.song_master_file_name ?? null,
          schema_version: savedMeta.song_master_schema_version ?? null,
          sha256: savedMeta.song_master_sha256 ?? null,
        })}`,
      );
    }

    const hasCacheAfterUpdate = await this.appDb.hasSongMaster();
    if (!hasCacheAfterUpdate) {
      throw new Error('曲マスタファイルの保存確認に失敗しました。');
    }

    return {
      ok: true,
      source: hasCache ? 'github_download' : 'initial_download',
      latest,
      ...(settingsWriteError ? { message: `app_settings保存に失敗: ${settingsWriteError}` } : {}),
    };
  }

  private async fetchLatest(): Promise<SongMasterLatest> {
    const response = await this.fetchImpl(this.options.latestJsonUrl, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`latest.json fetch failed: ${response.status}`);
    }

    const rawText = await response.text();
    const body = parseLatestJsonText(rawText, this.options.latestJsonUrl);

    const latest: SongMasterLatest = {
      file_name: String(body.file_name ?? ''),
      schema_version: Number(body.schema_version),
      sha256: String(body.sha256 ?? ''),
      byte_size: Number(body.byte_size),
      ...(typeof body.updated_at === 'string' ? { updated_at: body.updated_at } : {}),
      ...(typeof body.download_url === 'string' ? { download_url: body.download_url } : {}),
    };

    if (!latest.file_name || !latest.sha256 || !Number.isFinite(latest.byte_size)) {
      throw new Error('latest.json fields are invalid');
    }

    return latest;
  }

  private async downloadAndVerify(downloadUrl: string, latest: SongMasterLatest): Promise<Uint8Array> {
    const response = await this.fetchImpl(downloadUrl, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`song master download failed: ${response.status}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== latest.byte_size) {
      throw new Error('song master byte_size mismatch');
    }

    const hash = sha256Hex(bytes);
    if (hash !== latest.sha256) {
      throw new Error('song master sha256 mismatch');
    }

    return bytes;
  }

  private async validateSqliteOpen(fileName: string): Promise<void> {
    const dbId = await this.client.open({ filename: `file:${SONG_MASTER_DIR}/${fileName}?vfs=opfs&immutable=1` });
    try {
      await this.client.query({
        dbId,
        sql: 'SELECT 1',
      });
    } finally {
      await this.client.close(dbId);
    }
  }

  private async persistMetaFile(latest: SongMasterLatest, downloadedAt: string): Promise<void> {
    const metaJson = JSON.stringify(
      {
        file_name: latest.file_name,
        schema_version: String(latest.schema_version),
        sha256: latest.sha256,
        byte_size: latest.byte_size,
        updated_at: latest.updated_at ?? '',
        downloaded_at: downloadedAt,
      },
      null,
      2,
    );
    const bytes = new TextEncoder().encode(metaJson);
    await this.opfs.writeFileAtomic(SONG_MASTER_META_FILE, bytes);
  }
}
