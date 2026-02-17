import { sha256Hex } from '@iidx/shared';

import { AppDatabase } from './app-db.js';
import { SongMasterLatest } from './models.js';
import { OpfsStorage } from './opfs.js';
import { SqliteDbId, SqliteWorkerClient } from './sqlite-client.js';

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

type SongMasterErrorCode =
  | 'network'
  | 'json_invalid'
  | 'schema_mismatch'
  | 'integrity_mismatch'
  | 'sqlite_invalid'
  | 'storage_failure';

class SongMasterUpdateError extends Error {
  constructor(
    public readonly code: SongMasterErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SongMasterUpdateError';
  }
}

const SONG_MASTER_DIR = 'song_master';
const SONG_MASTER_META_FILE = `${SONG_MASTER_DIR}/latest_meta.json`;
const SQLITE_FILE_NAME_RE = /\.sqlite$/i;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

function normalizeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isIsoDateTime(value: string): boolean {
  if (!value.includes('T')) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isValidSqliteFileName(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  if (value.includes('/') || value.includes('\\')) {
    return false;
  }
  return SQLITE_FILE_NAME_RE.test(value);
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
      const message = `Song master update failed (${this.describeFailure(error)}).`;
      if (hasCache) {
        return {
          ok: true,
          source: 'local_cache',
          message: `${message} Continue using local cache.`,
        };
      }
      return {
        ok: false,
        source: 'initial_download',
        message,
      };
    }

    const requiredSchemaVersion = String(this.options.requiredSchemaVersion);
    const latestSchemaVersion = String(latest.schema_version);
    if (latestSchemaVersion !== requiredSchemaVersion) {
      return {
        ok: false,
        source: 'github_download',
        latest,
        message: this.describeFailure(
          new SongMasterUpdateError(
            'schema_mismatch',
            `schema_version mismatch (required=${requiredSchemaVersion}, latest=${latestSchemaVersion})`,
          ),
        ),
      };
    }

    const cachedMeta = await this.appDb.getSongMasterMeta();
    const cachedSha = (cachedMeta.last_song_master_sha256 ?? cachedMeta.song_master_sha256 ?? '').trim();
    const cachedByteSize = (cachedMeta.last_song_master_byte_size ?? cachedMeta.song_master_byte_size ?? '').trim();
    const needsDownload = force || !hasCache || cachedSha !== latest.sha256 || cachedByteSize !== String(latest.byte_size);

    if (!needsDownload) {
      return {
        ok: true,
        source: 'up_to_date',
        latest,
      };
    }

    try {
      const sqliteUrl = this.buildSqliteDownloadUrl(latest.file_name);
      const bytes = await this.downloadAndVerify(sqliteUrl, latest);

      const relativePath = `${SONG_MASTER_DIR}/${latest.file_name}`;
      await this.opfs.writeFileAtomic(relativePath, bytes, {
        validate: async (data) => {
          const header = new TextDecoder().decode(data.slice(0, 16));
          if (!header.startsWith('SQLite format 3')) {
            throw new SongMasterUpdateError('sqlite_invalid', 'downloaded file is not sqlite');
          }
        },
      });

      await this.validateSqliteOpen(latest.file_name);

      const downloadedAt = new Date().toISOString();
      await this.persistMetaFile(latest, downloadedAt);
      await this.persistSettings(latest, downloadedAt);

      return {
        ok: true,
        source: hasCache ? 'github_download' : 'initial_download',
        latest,
      };
    } catch (error) {
      const message = `Song master update failed (${this.describeFailure(error)}).`;
      if (hasCache) {
        return {
          ok: true,
          source: 'local_cache',
          latest,
          message: `${message} Continue using local cache.`,
        };
      }
      return {
        ok: false,
        source: 'initial_download',
        latest,
        message,
      };
    }
  }

  private async fetchLatest(): Promise<SongMasterLatest> {
    const response = await this.fetchNoStore(this.options.latestJsonUrl, 'latest.json');
    const rawText = await response.text();
    let body: unknown;

    try {
      body = JSON.parse(rawText);
    } catch {
      throw new SongMasterUpdateError('json_invalid', 'latest.json is not valid JSON');
    }

    if (!body || typeof body !== 'object') {
      throw new SongMasterUpdateError('json_invalid', 'latest.json root must be an object');
    }

    const payload = body as Record<string, unknown>;
    const fileName = this.requireTextField(payload, 'file_name');
    if (!isValidSqliteFileName(fileName)) {
      throw new SongMasterUpdateError('json_invalid', 'file_name must be a sqlite file name');
    }

    const schemaVersion = this.requireSchemaVersion(payload, 'schema_version');
    const generatedAt = this.requireTextField(payload, 'generated_at');
    if (!isIsoDateTime(generatedAt)) {
      throw new SongMasterUpdateError('json_invalid', 'generated_at must be an ISO8601 datetime');
    }

    const sha256 = this.requireTextField(payload, 'sha256').toLowerCase();
    if (!SHA256_HEX_RE.test(sha256)) {
      throw new SongMasterUpdateError('json_invalid', 'sha256 must be a 64-char hex string');
    }

    const byteSize = this.requireByteSize(payload, 'byte_size');

    return {
      file_name: fileName,
      schema_version: schemaVersion,
      generated_at: generatedAt,
      sha256,
      byte_size: byteSize,
    };
  }

  private async downloadAndVerify(downloadUrl: string, latest: SongMasterLatest): Promise<Uint8Array> {
    const response = await this.fetchNoStore(downloadUrl, latest.file_name);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== latest.byte_size) {
      throw new SongMasterUpdateError(
        'integrity_mismatch',
        `byte_size mismatch (expected=${latest.byte_size}, actual=${bytes.byteLength})`,
      );
    }

    const digest = sha256Hex(bytes);
    if (digest !== latest.sha256) {
      throw new SongMasterUpdateError(
        'integrity_mismatch',
        `sha256 mismatch (expected=${latest.sha256}, actual=${digest})`,
      );
    }

    return bytes;
  }

  private async fetchNoStore(url: string, label: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { cache: 'no-store' });
    } catch (error) {
      throw new SongMasterUpdateError('network', `${label} fetch failed: ${normalizeUnknownError(error)}`);
    }

    if (!response.ok) {
      throw new SongMasterUpdateError('network', `${label} fetch failed: ${response.status}`);
    }

    return response;
  }

  private buildSqliteDownloadUrl(fileName: string): string {
    const base = this.options.sqliteBaseUrl.endsWith('/') ? this.options.sqliteBaseUrl : `${this.options.sqliteBaseUrl}/`;
    return new URL(fileName, base).toString();
  }

  private requireTextField(payload: Record<string, unknown>, key: string): string {
    const value = payload[key];
    if (typeof value !== 'string') {
      throw new SongMasterUpdateError('json_invalid', `${key} is missing`);
    }
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new SongMasterUpdateError('json_invalid', `${key} is empty`);
    }
    return normalized;
  }

  private requireSchemaVersion(payload: Record<string, unknown>, key: string): string | number {
    const value = payload[key];
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new SongMasterUpdateError('json_invalid', `${key} must be string or number`);
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new SongMasterUpdateError('json_invalid', `${key} number is invalid`);
      }
      return value;
    }
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new SongMasterUpdateError('json_invalid', `${key} is empty`);
    }
    return normalized;
  }

  private requireByteSize(payload: Record<string, unknown>, key: string): number {
    const raw = payload[key];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
      throw new SongMasterUpdateError('json_invalid', `${key} must be a positive integer`);
    }
    return parsed;
  }

  private async validateSqliteOpen(fileName: string): Promise<void> {
    let dbId: SqliteDbId | null = null;
    try {
      dbId = await this.client.open({
        filename: `file:${SONG_MASTER_DIR}/${fileName}?vfs=opfs&immutable=1`,
      });
      await this.client.query({
        dbId,
        sql: 'SELECT 1',
      });
    } catch (error) {
      throw new SongMasterUpdateError('sqlite_invalid', `sqlite validation failed: ${normalizeUnknownError(error)}`);
    } finally {
      if (dbId !== null) {
        await this.client.close(dbId);
      }
    }
  }

  private async persistSettings(latest: SongMasterLatest, downloadedAt: string): Promise<void> {
    const schemaVersion = String(latest.schema_version);
    const entries: Array<[string, string]> = [
      ['song_master_file_name', latest.file_name],
      ['song_master_schema_version', schemaVersion],
      ['song_master_sha256', latest.sha256],
      ['song_master_byte_size', String(latest.byte_size)],
      ['song_master_updated_at', latest.generated_at],
      ['song_master_generated_at', latest.generated_at],
      ['song_master_downloaded_at', downloadedAt],
      ['last_song_master_file_name', latest.file_name],
      ['last_song_master_schema_version', schemaVersion],
      ['last_song_master_sha256', latest.sha256],
      ['last_song_master_byte_size', String(latest.byte_size)],
      ['last_song_master_generated_at', latest.generated_at],
      ['last_song_master_downloaded_at', downloadedAt],
    ];

    try {
      for (const [key, value] of entries) {
        await this.appDb.setSetting(key, value);
      }
    } catch (error) {
      throw new SongMasterUpdateError(
        'storage_failure',
        `failed to persist song master settings: ${normalizeUnknownError(error)}`,
      );
    }
  }

  private async persistMetaFile(latest: SongMasterLatest, downloadedAt: string): Promise<void> {
    const metaJson = JSON.stringify(
      {
        file_name: latest.file_name,
        schema_version: String(latest.schema_version),
        sha256: latest.sha256,
        byte_size: latest.byte_size,
        generated_at: latest.generated_at,
        downloaded_at: downloadedAt,
      },
      null,
      2,
    );
    const bytes = new TextEncoder().encode(metaJson);
    try {
      await this.opfs.writeFileAtomic(SONG_MASTER_META_FILE, bytes);
    } catch (error) {
      throw new SongMasterUpdateError('storage_failure', `failed to persist meta file: ${normalizeUnknownError(error)}`);
    }
  }

  private describeFailure(error: unknown): string {
    if (error instanceof SongMasterUpdateError) {
      switch (error.code) {
        case 'network':
          return `network_error: ${error.message}`;
        case 'json_invalid':
          return `invalid_latest_json: ${error.message}`;
        case 'schema_mismatch':
          return `schema_mismatch: ${error.message}`;
        case 'integrity_mismatch':
          return `integrity_mismatch: ${error.message}`;
        case 'sqlite_invalid':
          return `sqlite_validation_failed: ${error.message}`;
        case 'storage_failure':
          return `storage_failure: ${error.message}`;
        default:
          return error.message;
      }
    }
    return normalizeUnknownError(error);
  }
}
