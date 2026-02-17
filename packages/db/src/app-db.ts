import {
  PAYLOAD_VERSION,
  TournamentPayload,
  buildEvidenceFileName,
  buildTournamentDefHash,
  normalizeTournamentPayload,
  validateTournamentInput,
} from '@iidx/shared';

import { OpfsStorage } from './opfs.js';
import {
  ChartSummary,
  CreateTournamentInput,
  IdFactory,
  ImportTargetTournament,
  ImportTournamentResult,
  RuntimeClock,
  SongSummary,
  SongMasterChartDetail,
  TournamentDetailChart,
  TournamentDetailItem,
  TournamentListItem,
  TournamentTab,
} from './models.js';
import { migrateAppDatabase } from './schema.js';
import { SqliteDbId, SqliteWorkerClient } from './sqlite-client.js';

const APP_DB_URI = 'file:app_data.sqlite?vfs=opfs';
const SONG_MASTER_DIR = 'song_master';
const SONG_MASTER_META_FILE = `${SONG_MASTER_DIR}/latest_meta.json`;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dbTodayJst(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function normalizeDbDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }
  const text = value.trim();
  if (ISO_DATE_RE.test(text)) {
    return text;
  }

  const leadingIso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  const leadingIsoDate = leadingIso?.[1];
  if (leadingIsoDate) {
    return leadingIsoDate;
  }

  const slash = text.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  const slashYear = slash?.[1];
  const slashMonth = slash?.[2];
  const slashDay = slash?.[3];
  if (slashYear && slashMonth && slashDay) {
    return `${slashYear}-${slashMonth}-${slashDay}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return fallback;
}

function normalizeDbText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function isSongSearchDebugEnabled(): boolean {
  const g = globalThis as { __IIDX_DEBUG_SONG_SEARCH__?: unknown; localStorage?: Storage };
  if (g.__IIDX_DEBUG_SONG_SEARCH__ === true) {
    return true;
  }
  if (g.localStorage) {
    try {
      return g.localStorage.getItem('iidx:debug:song-search') === '1';
    } catch {
      return false;
    }
  }
  return false;
}

function debugSongSearch(message: string, payload?: unknown): void {
  if (!isSongSearchDebugEnabled()) {
    return;
  }
  if (payload === undefined) {
    console.info(`[song-search] ${message}`);
    return;
  }
  console.info(`[song-search] ${message}`, payload);
}

interface SongMasterMetaFile {
  file_name?: string;
  schema_version?: string | number;
  sha256?: string;
  byte_size?: string | number;
  generated_at?: string;
  updated_at?: string;
  downloaded_at?: string;
}

function pickMetaValue(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

interface SongSearchRow {
  music_id?: unknown;
  title?: unknown;
  version_code?: unknown;
  [key: string]: unknown;
}

const defaultClock: RuntimeClock = {
  nowIso: () => new Date().toISOString(),
  todayJst: () => dbTodayJst(),
};

const defaultIdFactory: IdFactory = {
  uuid: () => crypto.randomUUID(),
};

export type LegacyImportMode2Decision = 'insert' | 'already_imported' | 'conflict';

export function resolveImportMode2(existingDefHash: string | null, incomingDefHash: string): LegacyImportMode2Decision {
  if (!existingDefHash) {
    return 'insert';
  }
  if (existingDefHash === incomingDefHash) {
    return 'already_imported';
  }
  return 'conflict';
}

interface EvidenceUpsertInput {
  tournamentUuid: string;
  chartId: number;
  sha256: string;
  width: number;
  height: number;
}

export interface EvidenceRecord {
  tournamentUuid: string;
  chartId: number;
  fileName: string;
  sha256: string;
  width: number;
  height: number;
  updateSeq: number;
  fileDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export class AppDatabase {
  private dbId: SqliteDbId | null = null;

  constructor(
    private readonly client: SqliteWorkerClient,
    private readonly opfs: OpfsStorage,
    private readonly clock: RuntimeClock = defaultClock,
    private readonly idFactory: IdFactory = defaultIdFactory,
  ) {}

  async init(): Promise<void> {
    if (this.dbId !== null) {
      return;
    }
    this.dbId = await this.client.open({ filename: APP_DB_URI });
    await migrateAppDatabase((sql) => this.exec(sql));
  }

  async dispose(): Promise<void> {
    if (this.dbId !== null) {
      await this.client.close(this.dbId);
      this.dbId = null;
    }
  }

  private requireDbId(): SqliteDbId {
    if (this.dbId === null) {
      throw new Error('AppDatabase is not initialized.');
    }
    return this.dbId;
  }

  private async exec(sql: string, bind?: unknown[]): Promise<void> {
    const options = bind ? { dbId: this.requireDbId(), sql, bind } : { dbId: this.requireDbId(), sql };
    await this.client.exec(options);
  }

  private async query<T extends Record<string, unknown>>(sql: string, bind?: unknown[]): Promise<T[]> {
    const options = bind ? { dbId: this.requireDbId(), sql, bind } : { dbId: this.requireDbId(), sql };
    return this.client.query<T>(options);
  }

  private async readSongMasterMetaFile(): Promise<SongMasterMetaFile | null> {
    try {
      const bytes = await this.opfs.readFile(SONG_MASTER_META_FILE);
      const text = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(text) as SongMasterMetaFile;
      return parsed;
    } catch {
      return null;
    }
  }

  async hasSongMaster(): Promise<boolean> {
    const meta = await this.getSongMasterMeta();
    const fileName = meta.song_master_file_name;
    if (!fileName) {
      return false;
    }
    return this.opfs.fileExists(`${SONG_MASTER_DIR}/${fileName}`);
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.exec(
      `INSERT OR REPLACE INTO app_settings("key", value) VALUES(?, ?)`,
      [key, value],
    );
  }

  async getSetting(key: string): Promise<string | null> {
    const rows = await this.query<{ key: string; value: string }>(
      'SELECT "key" as key, value FROM app_settings',
    );
    const row = rows.find((entry) => entry.key === key);
    return row?.value ?? null;
  }

  async getSongMasterMeta(): Promise<Record<string, string | null>> {
    const keys = [
      'song_master_file_name',
      'song_master_schema_version',
      'song_master_sha256',
      'song_master_byte_size',
      'song_master_generated_at',
      'song_master_updated_at',
      'song_master_downloaded_at',
      'last_song_master_file_name',
      'last_song_master_schema_version',
      'last_song_master_sha256',
      'last_song_master_byte_size',
      'last_song_master_generated_at',
      'last_song_master_downloaded_at',
    ];

    const result: Record<string, string | null> = {};
    for (const key of keys) {
      result[key] = await this.getSetting(key);
    }

    const fileMeta = await this.readSongMasterMetaFile();
    const metaFileName =
      fileMeta && typeof fileMeta.file_name === 'string' && fileMeta.file_name.length > 0 ? fileMeta.file_name : null;
    const metaSchemaVersion =
      fileMeta && fileMeta.schema_version !== undefined && fileMeta.schema_version !== null
        ? String(fileMeta.schema_version)
        : null;
    const metaSha256 = fileMeta && typeof fileMeta.sha256 === 'string' && fileMeta.sha256.length > 0 ? fileMeta.sha256 : null;
    const metaByteSize =
      fileMeta && fileMeta.byte_size !== undefined && fileMeta.byte_size !== null ? String(fileMeta.byte_size) : null;
    const metaGeneratedAt =
      fileMeta && typeof fileMeta.generated_at === 'string'
        ? fileMeta.generated_at
        : fileMeta && typeof fileMeta.updated_at === 'string'
          ? fileMeta.updated_at
          : null;
    const metaDownloadedAt = fileMeta && typeof fileMeta.downloaded_at === 'string' ? fileMeta.downloaded_at : null;

    const fileName = pickMetaValue(result.last_song_master_file_name, result.song_master_file_name, metaFileName);
    const schemaVersion = pickMetaValue(
      result.last_song_master_schema_version,
      result.song_master_schema_version,
      metaSchemaVersion,
    );
    const sha256 = pickMetaValue(result.last_song_master_sha256, result.song_master_sha256, metaSha256);
    const byteSize = pickMetaValue(result.last_song_master_byte_size, result.song_master_byte_size, metaByteSize);
    const generatedAt = pickMetaValue(
      result.last_song_master_generated_at,
      result.song_master_generated_at,
      result.song_master_updated_at,
      metaGeneratedAt,
    );
    const downloadedAt = pickMetaValue(
      result.last_song_master_downloaded_at,
      result.song_master_downloaded_at,
      metaDownloadedAt,
    );

    return {
      song_master_file_name: fileName,
      song_master_schema_version: schemaVersion,
      song_master_sha256: sha256,
      song_master_byte_size: byteSize,
      song_master_generated_at: generatedAt,
      song_master_updated_at: generatedAt,
      song_master_downloaded_at: downloadedAt,
      last_song_master_file_name: fileName,
      last_song_master_schema_version: schemaVersion,
      last_song_master_sha256: sha256,
      last_song_master_byte_size: byteSize,
      last_song_master_generated_at: generatedAt,
      last_song_master_downloaded_at: downloadedAt,
    };
  }

  async createTournament(input: CreateTournamentInput): Promise<string> {
    const errors = validateTournamentInput(
      {
        tournamentName: input.tournamentName,
        owner: input.owner,
        hashtag: input.hashtag,
        startDate: input.startDate,
        endDate: input.endDate,
        chartIds: input.chartIds,
      },
      this.clock.todayJst(),
    );
    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    const tournamentUuid = this.idFactory.uuid();
    const now = this.clock.nowIso();
    const payload: TournamentPayload = normalizeTournamentPayload({
      v: PAYLOAD_VERSION,
      uuid: tournamentUuid,
      name: input.tournamentName,
      owner: input.owner,
      hashtag: input.hashtag,
      start: input.startDate,
      end: input.endDate,
      charts: input.chartIds,
    });
    const defHash = buildTournamentDefHash(payload);

    await this.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      await this.exec(
        `INSERT INTO tournaments(
           tournament_uuid,
           source_tournament_uuid,
           def_hash,
           tournament_name,
           owner,
           hashtag,
           start_date,
           end_date,
           is_imported,
           created_at,
           updated_at
         ) VALUES(?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          tournamentUuid,
          defHash,
          payload.name,
          payload.owner,
          payload.hashtag,
          payload.start,
          payload.end,
          now,
          now,
        ],
      );

      for (const chartId of payload.charts) {
        await this.exec(
          `INSERT INTO tournament_charts(tournament_uuid, chart_id)
           VALUES(?, ?)`,
          [tournamentUuid, chartId],
        );
      }
      await this.exec('COMMIT');
      return tournamentUuid;
    } catch (error) {
      await this.exec('ROLLBACK');
      throw error;
    }
  }

  async findImportTargetTournament(sourceTournamentUuid: string): Promise<ImportTargetTournament | null> {
    const today = this.clock.todayJst();
    const rows = await this.query<{
      tournament_uuid: string;
      source_tournament_uuid: string | null;
      tournament_name: string;
      owner: string;
      hashtag: string;
      start_date: string;
      end_date: string;
    }>(
      `
      SELECT
        t.tournament_uuid,
        t.source_tournament_uuid,
        t.tournament_name,
        t.owner,
        t.hashtag,
        t.start_date,
        t.end_date
      FROM tournaments t
      WHERE t.source_tournament_uuid = ?
         OR t.tournament_uuid = ?
      ORDER BY CASE WHEN t.source_tournament_uuid = ? THEN 0 ELSE 1 END ASC, t.created_at ASC
      LIMIT 1
      `,
      [sourceTournamentUuid, sourceTournamentUuid, sourceTournamentUuid],
    );

    const base = rows[0];
    if (!base) {
      return null;
    }

    const chartRows = await this.query<{ chart_id: number }>(
      `
      SELECT chart_id
      FROM tournament_charts
      WHERE tournament_uuid = ?
      ORDER BY tournament_chart_id ASC
      `,
      [base.tournament_uuid],
    );

    const chartIds = chartRows.map((row) => Number(row.chart_id));
    const startDate = normalizeDbDate(base.start_date, today);
    const endDate = normalizeDbDate(base.end_date, startDate);
    return {
      tournamentUuid: base.tournament_uuid,
      sourceTournamentUuid: base.source_tournament_uuid,
      tournamentName: base.tournament_name,
      owner: base.owner,
      hashtag: base.hashtag,
      startDate,
      endDate,
      chartIds,
    };
  }

  async listSongMasterChartsByIds(chartIds: number[]): Promise<SongMasterChartDetail[]> {
    const normalizedChartIds = [...new Set(chartIds)]
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((a, b) => a - b);
    if (normalizedChartIds.length === 0) {
      return [];
    }

    const fileName = await this.getSongMasterDbFileName();
    if (!fileName) {
      return [];
    }

    const exists = await this.opfs.fileExists(`${SONG_MASTER_DIR}/${fileName}`);
    if (!exists) {
      return [];
    }

    const placeholders = normalizedChartIds.map(() => '?').join(', ');
    const dbId = await this.client.open({ filename: `file:${SONG_MASTER_DIR}/${fileName}?vfs=opfs&immutable=1` });
    try {
      const rows = await this.client.query<{
        chart_id: number;
        title: unknown;
        play_style: unknown;
        difficulty: unknown;
        level: unknown;
      }>({
        dbId,
        sql: `
          SELECT c.chart_id, m.title, c.play_style, c.difficulty, c.level
          FROM chart c
          LEFT JOIN music m ON m.music_id = c.music_id
          WHERE c.chart_id IN (${placeholders})
          ORDER BY c.chart_id ASC
        `,
        bind: normalizedChartIds,
      });

      return rows.map((row) => {
        const chartId = Number(row.chart_id);
        const title = normalizeDbText(row.title);
        const playStyle = normalizeDbText(row.play_style);
        const difficulty = normalizeDbText(row.difficulty);
        const level = normalizeDbText(row.level);
        return {
          chartId,
          title: title ?? `chart:${chartId}`,
          playStyle: playStyle ?? '-',
          difficulty: difficulty ?? '-',
          level: level ?? '-',
        };
      });
    } finally {
      await this.client.close(dbId);
    }
  }

  async importTournament(payloadInput: TournamentPayload): Promise<ImportTournamentResult> {
    const payload = normalizeTournamentPayload(payloadInput, { nowDate: this.clock.todayJst() });
    const incomingDefHash = buildTournamentDefHash(payload);
    const existing = await this.findImportTargetTournament(payload.uuid);
    if (existing) {
      if (existing.startDate !== payload.start || existing.endDate !== payload.end) {
        return {
          status: 'incompatible',
          tournamentUuid: existing.tournamentUuid,
          reason: 'period_mismatch',
        };
      }

      const existingChartSet = new Set(existing.chartIds);
      const addedChartIds = payload.charts.filter((chartId) => !existingChartSet.has(chartId));
      const existingCharts = payload.charts.length - addedChartIds.length;
      if (addedChartIds.length === 0) {
        return {
          status: 'unchanged',
          tournamentUuid: existing.tournamentUuid,
          addedCharts: 0,
          existingCharts,
        };
      }

      const mergedHashPayload: TournamentPayload = normalizeTournamentPayload({
        v: PAYLOAD_VERSION,
        uuid: existing.sourceTournamentUuid ?? existing.tournamentUuid,
        name: existing.tournamentName,
        owner: existing.owner,
        hashtag: existing.hashtag,
        start: existing.startDate,
        end: existing.endDate,
        charts: [...new Set([...existing.chartIds, ...addedChartIds])],
      });
      const mergedDefHash = buildTournamentDefHash(mergedHashPayload);
      const now = this.clock.nowIso();

      await this.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        for (const chartId of addedChartIds) {
          await this.exec(
            `INSERT INTO tournament_charts(tournament_uuid, chart_id)
             VALUES(?, ?)`,
            [existing.tournamentUuid, chartId],
          );
        }
        await this.exec(
          `UPDATE tournaments
           SET def_hash = ?,
               updated_at = ?
           WHERE tournament_uuid = ?`,
          [mergedDefHash, now, existing.tournamentUuid],
        );
        await this.exec('COMMIT');
      } catch (error) {
        await this.exec('ROLLBACK');
        throw error;
      }

      return {
        status: 'merged',
        tournamentUuid: existing.tournamentUuid,
        addedCharts: addedChartIds.length,
        existingCharts,
      };
    }

    const tournamentUuid = this.idFactory.uuid();
    const now = this.clock.nowIso();

    await this.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      await this.exec(
        `INSERT INTO tournaments(
           tournament_uuid,
           source_tournament_uuid,
           def_hash,
           tournament_name,
           owner,
           hashtag,
           start_date,
           end_date,
           is_imported,
           created_at,
           updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          tournamentUuid,
          payload.uuid,
          incomingDefHash,
          payload.name,
          payload.owner,
          payload.hashtag,
          payload.start,
          payload.end,
          now,
          now,
        ],
      );

      for (const chartId of payload.charts) {
        await this.exec(
          `INSERT INTO tournament_charts(tournament_uuid, chart_id)
           VALUES(?, ?)`,
          [tournamentUuid, chartId],
        );
      }

      await this.exec('COMMIT');
      return {
        status: 'imported',
        tournamentUuid,
        addedCharts: payload.charts.length,
        existingCharts: 0,
      };
    } catch (error) {
      await this.exec('ROLLBACK');
      throw error;
    }
  }

  private whereAndSortForTab(tab: TournamentTab): { whereSql: string; bind: unknown[]; orderSql: string } {
    const today = this.clock.todayJst();
    if (tab === 'active') {
      return {
        whereSql: 'WHERE t.start_date <= ? AND t.end_date >= ?',
        bind: [today, today],
        orderSql: 'ORDER BY t.end_date ASC, t.start_date ASC',
      };
    }
    if (tab === 'upcoming') {
      return {
        whereSql: 'WHERE t.start_date > ?',
        bind: [today],
        orderSql: 'ORDER BY t.start_date ASC, t.end_date ASC',
      };
    }
    return {
      whereSql: 'WHERE t.end_date < ?',
      bind: [today],
      orderSql: 'ORDER BY t.end_date DESC, t.start_date DESC',
    };
  }

  async listTournaments(tab: TournamentTab): Promise<TournamentListItem[]> {
    const filter = this.whereAndSortForTab(tab);
    const today = this.clock.todayJst();
    const rows = await this.query<{
      tournament_uuid: string;
      source_tournament_uuid: string | null;
      tournament_name: string;
      owner: string;
      hashtag: string;
      start_date: string;
      end_date: string;
      is_imported: number;
      chart_count: number;
      submitted_count: number;
    }>(
      `
      SELECT
        t.tournament_uuid,
        t.source_tournament_uuid,
        t.tournament_name,
        t.owner,
        t.hashtag,
        t.start_date,
        t.end_date,
        t.is_imported,
        COUNT(DISTINCT tc.chart_id) AS chart_count,
        COUNT(DISTINCT CASE WHEN e.update_seq > 0 AND e.file_deleted = 0 THEN tc.chart_id END) AS submitted_count
      FROM tournaments t
      INNER JOIN tournament_charts tc ON tc.tournament_uuid = t.tournament_uuid
      LEFT JOIN evidences e
        ON e.tournament_uuid = tc.tournament_uuid
        AND e.chart_id = tc.chart_id
      ${filter.whereSql}
      GROUP BY t.tournament_uuid
      ${filter.orderSql}
      `,
      filter.bind,
    );

    return rows.map((row) => {
      const chartCount = Number(row.chart_count);
      const submittedCount = Number(row.submitted_count);
      const startDate = normalizeDbDate(row.start_date, today);
      const endDate = normalizeDbDate(row.end_date, startDate);
      return {
        tournamentUuid: row.tournament_uuid,
        sourceTournamentUuid: row.source_tournament_uuid,
        tournamentName: row.tournament_name,
        owner: row.owner,
        hashtag: row.hashtag,
        startDate,
        endDate,
        isImported: row.is_imported === 1,
        chartCount,
        submittedCount,
        pendingCount: Math.max(0, chartCount - submittedCount),
      };
    });
  }

  async getTournamentDetail(tournamentUuid: string): Promise<TournamentDetailItem | null> {
    const today = this.clock.todayJst();
    const tournamentRows = await this.query<{
      tournament_uuid: string;
      source_tournament_uuid: string | null;
      tournament_name: string;
      owner: string;
      hashtag: string;
      start_date: string;
      end_date: string;
      is_imported: number;
      chart_count: number;
      submitted_count: number;
    }>(
      `
      SELECT
        t.tournament_uuid,
        t.source_tournament_uuid,
        t.tournament_name,
        t.owner,
        t.hashtag,
        t.start_date,
        t.end_date,
        t.is_imported,
        COUNT(DISTINCT tc.chart_id) AS chart_count,
        COUNT(DISTINCT CASE WHEN e.update_seq > 0 AND e.file_deleted = 0 THEN tc.chart_id END) AS submitted_count
      FROM tournaments t
      INNER JOIN tournament_charts tc ON tc.tournament_uuid = t.tournament_uuid
      LEFT JOIN evidences e
        ON e.tournament_uuid = tc.tournament_uuid
        AND e.chart_id = tc.chart_id
      WHERE t.tournament_uuid = ?
      GROUP BY t.tournament_uuid
      `,
      [tournamentUuid],
    );

    const base = tournamentRows[0];
    if (!base) {
      return null;
    }

    const charts = await this.getTournamentCharts(tournamentUuid);
    const startDate = normalizeDbDate(base.start_date, today);
    const endDate = normalizeDbDate(base.end_date, startDate);

    return {
      tournamentUuid: base.tournament_uuid,
      sourceTournamentUuid: base.source_tournament_uuid,
      tournamentName: base.tournament_name,
      owner: base.owner,
      hashtag: base.hashtag,
      startDate,
      endDate,
      isImported: base.is_imported === 1,
      chartCount: Number(base.chart_count),
      submittedCount: Number(base.submitted_count),
      pendingCount: Math.max(0, Number(base.chart_count) - Number(base.submitted_count)),
      charts,
    };
  }

  private async getSongMasterDbFileName(): Promise<string | null> {
    const meta = await this.getSongMasterMeta();
    return meta.song_master_file_name ?? null;
  }

  async searchSongsByPrefix(prefix: string, limit = 30): Promise<SongSummary[]> {
    const fileName = await this.getSongMasterDbFileName();
    debugSongSearch('search request', { prefix, limit, fileName });
    if (!fileName) {
      debugSongSearch('skip search: song master file name is missing');
      return [];
    }

    const normalizedPrefix = prefix.trim().toLowerCase();

    const dbId = await this.client.open({ filename: `file:${SONG_MASTER_DIR}/${fileName}?vfs=opfs&immutable=1` });
    try {
      const likePattern = normalizedPrefix.length > 0 ? `%${normalizedPrefix}%` : '%';
      const rows = await this.client.query<SongSearchRow>({
        dbId,
        sql: `
          SELECT music_id, title, COALESCE(version, '') AS version_code
          FROM music
          WHERE (is_ac_active = 1 OR is_inf_active = 1)
            AND (? = '' OR title_search_key LIKE ?)
          ORDER BY title_search_key ASC
          LIMIT ?
        `,
        bind: [normalizedPrefix, likePattern, limit],
      });

      debugSongSearch('raw rows loaded', {
        rowCount: rows.length,
        likePattern,
        sampleRows: rows.slice(0, 3),
      });

      const mapped: SongSummary[] = [];
      for (const row of rows) {
        const musicId = Number(row.music_id);
        const title = typeof row.title === 'string' ? row.title.trim() : String(row.title ?? '').trim();
        const version = row.version_code === null || row.version_code === undefined ? '' : String(row.version_code).trim();

        if (!Number.isFinite(musicId) || musicId <= 0 || title.length === 0) {
          debugSongSearch('drop invalid song row', { row });
          continue;
        }

        mapped.push({
          musicId,
          title,
          version,
        });
      }
      debugSongSearch('mapped rows', {
        rowCount: mapped.length,
        sample: mapped.slice(0, 3),
      });
      return mapped;
    } finally {
      await this.client.close(dbId);
    }
  }

  async getChartsByMusicAndStyle(musicId: number, playStyle: string): Promise<ChartSummary[]> {
    const fileName = await this.getSongMasterDbFileName();
    if (!fileName) {
      return [];
    }

    const dbId = await this.client.open({ filename: `file:${SONG_MASTER_DIR}/${fileName}?vfs=opfs&immutable=1` });
    try {
      const rows = await this.client.query<{
        chart_id: number;
        music_id: number;
        play_style: unknown;
        difficulty: unknown;
        level: unknown;
        is_active: number;
      }>({
        dbId,
        sql: `
          SELECT chart_id, music_id, play_style, difficulty, level, is_active
          FROM chart
          WHERE music_id = ?
            AND play_style = ?
          ORDER BY chart_id ASC
        `,
        bind: [musicId, playStyle],
      });

      return rows.map((row) => ({
        chartId: Number(row.chart_id),
        musicId: Number(row.music_id),
        playStyle: normalizeDbText(row.play_style) ?? '-',
        difficulty: normalizeDbText(row.difficulty) ?? '-',
        level: normalizeDbText(row.level) ?? '-',
        isActive: Number(row.is_active),
      }));
    } finally {
      await this.client.close(dbId);
    }
  }

  private async getTournamentCharts(tournamentUuid: string): Promise<TournamentDetailChart[]> {
    const chartRows = await this.query<{
      chart_id: number;
      update_seq: number | null;
      file_deleted: number | null;
    }>(
      `
      SELECT tc.chart_id, e.update_seq, e.file_deleted
      FROM tournament_charts tc
      LEFT JOIN evidences e ON e.tournament_uuid = tc.tournament_uuid AND e.chart_id = tc.chart_id
      WHERE tc.tournament_uuid = ?
      ORDER BY tc.tournament_chart_id ASC
      `,
      [tournamentUuid],
    );

    if (chartRows.length === 0) {
      return [];
    }

    const toFallbackChart = (
      row: { chart_id: number; update_seq: number | null; file_deleted: number | null },
      resolveIssue: 'MASTER_MISSING' | 'CHART_NOT_FOUND',
    ): TournamentDetailChart => {
      const chartId = Number(row.chart_id);
      const updateSeq = Number(row.update_seq ?? 0);
      const fileDeleted = Number(row.file_deleted ?? 0) === 1;
      return {
        chartId,
        title: `chart:${chartId}`,
        playStyle: '-',
        difficulty: '-',
        level: '-',
        resolveIssue,
        submitted: updateSeq > 0 && !fileDeleted,
        updateSeq,
        fileDeleted,
      };
    };

    const fileName = await this.getSongMasterDbFileName();
    if (!fileName) {
      return chartRows.map((row) => toFallbackChart(row, 'MASTER_MISSING'));
    }

    const exists = await this.opfs.fileExists(`${SONG_MASTER_DIR}/${fileName}`);
    if (!exists) {
      return chartRows.map((row) => toFallbackChart(row, 'MASTER_MISSING'));
    }

    const chartIds = chartRows.map((row) => Number(row.chart_id));
    const songMasterRows = await this.listSongMasterChartsByIds(chartIds);
    const songMasterByChartId = new Map<number, SongMasterChartDetail>();
    for (const row of songMasterRows) {
      songMasterByChartId.set(row.chartId, row);
    }

    return chartRows.map((row) => {
      const chartId = Number(row.chart_id);
      const updateSeq = Number(row.update_seq ?? 0);
      const fileDeleted = Number(row.file_deleted ?? 0) === 1;
      const songMaster = songMasterByChartId.get(chartId);
      if (!songMaster) {
        return toFallbackChart(row, 'CHART_NOT_FOUND');
      }
      return {
        chartId,
        title: songMaster.title,
        playStyle: songMaster.playStyle,
        difficulty: songMaster.difficulty,
        level: songMaster.level,
        resolveIssue: null,
        submitted: updateSeq > 0 && !fileDeleted,
        updateSeq,
        fileDeleted,
      };
    });
  }

  async upsertEvidenceMetadata(input: EvidenceUpsertInput): Promise<{ updated: boolean; updateSeq: number; fileName: string }> {
    const fileName = buildEvidenceFileName(input.tournamentUuid, input.chartId);
    const existing = await this.query<{ sha256: string; update_seq: number }>(
      `SELECT sha256, update_seq
       FROM evidences
       WHERE tournament_uuid = ?
         AND chart_id = ?
       LIMIT 1`,
      [input.tournamentUuid, input.chartId],
    );

    const now = this.clock.nowIso();
    if (existing[0] && existing[0].sha256 === input.sha256) {
      return {
        updated: false,
        updateSeq: Number(existing[0].update_seq),
        fileName,
      };
    }

    if (existing[0]) {
      const nextSeq = Number(existing[0].update_seq) + 1;
      await this.exec(
        `UPDATE evidences
         SET file_name = ?,
             sha256 = ?,
             width = ?,
             height = ?,
             update_seq = ?,
             file_deleted = 0,
             deleted_at = NULL,
             updated_at = ?
         WHERE tournament_uuid = ?
           AND chart_id = ?`,
        [
          fileName,
          input.sha256,
          input.width,
          input.height,
          nextSeq,
          now,
          input.tournamentUuid,
          input.chartId,
        ],
      );
      return {
        updated: true,
        updateSeq: nextSeq,
        fileName,
      };
    }

    await this.exec(
      `INSERT INTO evidences(
         tournament_uuid,
         chart_id,
         file_name,
         sha256,
         width,
         height,
         update_seq,
         file_deleted,
         created_at,
         updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      [
        input.tournamentUuid,
        input.chartId,
        fileName,
        input.sha256,
        input.width,
        input.height,
        now,
        now,
      ],
    );

    return {
      updated: true,
      updateSeq: 1,
      fileName,
    };
  }

  async getEvidenceRecord(tournamentUuid: string, chartId: number): Promise<EvidenceRecord | null> {
    const rows = await this.query<{
      tournament_uuid: string;
      chart_id: number;
      file_name: string;
      sha256: string;
      width: number;
      height: number;
      update_seq: number;
      file_deleted: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT tournament_uuid, chart_id, file_name, sha256, width, height, update_seq, file_deleted, created_at, updated_at
       FROM evidences
       WHERE tournament_uuid = ?
         AND chart_id = ?
       LIMIT 1`,
      [tournamentUuid, chartId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      tournamentUuid: row.tournament_uuid,
      chartId: Number(row.chart_id),
      fileName: row.file_name,
      sha256: row.sha256,
      width: Number(row.width),
      height: Number(row.height),
      updateSeq: Number(row.update_seq),
      fileDeleted: Number(row.file_deleted) === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getEvidenceRelativePath(tournamentUuid: string, chartId: number): Promise<string> {
    return `evidences/${tournamentUuid}/${chartId}.jpg`;
  }

  async deleteTournament(tournamentUuid: string): Promise<void> {
    const evidenceRows = await this.query<{ chart_id: number }>(
      `SELECT chart_id
       FROM evidences
       WHERE tournament_uuid = ?`,
      [tournamentUuid],
    );

    for (const evidenceRow of evidenceRows) {
      const path = await this.getEvidenceRelativePath(tournamentUuid, Number(evidenceRow.chart_id));
      await this.opfs.deleteFile(path);
    }

    await this.exec('DELETE FROM tournaments WHERE tournament_uuid = ?', [tournamentUuid]);
  }

  async reconcileEvidenceFiles(): Promise<void> {
    const rows = await this.query<{ tournament_uuid: string; chart_id: number }>(
      `SELECT tournament_uuid, chart_id
       FROM evidences
       WHERE file_deleted = 0`,
    );

    const now = this.clock.nowIso();
    for (const row of rows) {
      const path = await this.getEvidenceRelativePath(row.tournament_uuid, Number(row.chart_id));
      const exists = await this.opfs.fileExists(path);
      if (!exists) {
        await this.exec(
          `UPDATE evidences
           SET file_deleted = 1,
               deleted_at = ?,
               updated_at = ?
           WHERE tournament_uuid = ?
             AND chart_id = ?`,
          [now, now, row.tournament_uuid, row.chart_id],
        );
      }
    }
  }

  async resetLocalData(): Promise<void> {
    await this.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      await this.exec('DELETE FROM tournaments');
      await this.exec('DELETE FROM app_settings');
      await this.exec('COMMIT');
    } catch (error) {
      await this.exec('ROLLBACK');
      throw error;
    }

    await this.opfs.deleteDirectory('evidences');
    await this.opfs.deleteDirectory(SONG_MASTER_DIR);
  }

  async setAutoDeleteConfig(enabled: boolean, days: number): Promise<void> {
    await this.setSetting('auto_delete_enabled', enabled ? '1' : '0');
    await this.setSetting('auto_delete_days', String(days));
  }

  async getAutoDeleteConfig(): Promise<{ enabled: boolean; days: number }> {
    const enabled = (await this.getSetting('auto_delete_enabled')) === '1';
    const days = Number(await this.getSetting('auto_delete_days')) || 0;
    return { enabled, days };
  }

  async purgeExpiredEvidenceIfNeeded(): Promise<number> {
    const config = await this.getAutoDeleteConfig();
    if (!config.enabled || config.days <= 0) {
      return 0;
    }

    const threshold = new Date(`${this.clock.todayJst()}T00:00:00.000Z`);
    threshold.setUTCDate(threshold.getUTCDate() - config.days);
    const thresholdDate = threshold.toISOString().slice(0, 10);

    const rows = await this.query<{ tournament_uuid: string; chart_id: number }>(
      `
      SELECT e.tournament_uuid, e.chart_id
      FROM evidences e
      INNER JOIN tournaments t ON t.tournament_uuid = e.tournament_uuid
      WHERE e.file_deleted = 0
        AND t.end_date <= ?
      `,
      [thresholdDate],
    );

    const now = this.clock.nowIso();
    let deletedCount = 0;
    for (const row of rows) {
      const path = await this.getEvidenceRelativePath(row.tournament_uuid, Number(row.chart_id));
      await this.opfs.deleteFile(path);
      await this.exec(
        `UPDATE evidences
         SET file_deleted = 1,
             deleted_at = ?,
             updated_at = ?
         WHERE tournament_uuid = ?
           AND chart_id = ?`,
        [now, now, row.tournament_uuid, row.chart_id],
      );
      deletedCount += 1;
    }

    return deletedCount;
  }
}
