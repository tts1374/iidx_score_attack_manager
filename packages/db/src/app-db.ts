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
  ImportTournamentResult,
  RuntimeClock,
  SongSummary,
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
  updated_at?: string;
  downloaded_at?: string;
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

export function resolveImportMode2(existingDefHash: string | null, incomingDefHash: string): ImportTournamentResult['status'] | 'insert' {
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
      'song_master_updated_at',
      'song_master_downloaded_at',
    ];

    const result: Record<string, string | null> = {};
    for (const key of keys) {
      result[key] = await this.getSetting(key);
    }

    const fileMeta = await this.readSongMasterMetaFile();
    if (!fileMeta) {
      return result;
    }

    return {
      song_master_file_name:
        result.song_master_file_name ??
        (typeof fileMeta.file_name === 'string' && fileMeta.file_name.length > 0 ? fileMeta.file_name : null),
      song_master_schema_version:
        result.song_master_schema_version ??
        (fileMeta.schema_version !== undefined && fileMeta.schema_version !== null
          ? String(fileMeta.schema_version)
          : null),
      song_master_sha256:
        result.song_master_sha256 ??
        (typeof fileMeta.sha256 === 'string' && fileMeta.sha256.length > 0 ? fileMeta.sha256 : null),
      song_master_byte_size:
        result.song_master_byte_size ??
        (fileMeta.byte_size !== undefined && fileMeta.byte_size !== null ? String(fileMeta.byte_size) : null),
      song_master_updated_at:
        result.song_master_updated_at ??
        (typeof fileMeta.updated_at === 'string' && fileMeta.updated_at.length > 0 ? fileMeta.updated_at : null),
      song_master_downloaded_at:
        result.song_master_downloaded_at ??
        (typeof fileMeta.downloaded_at === 'string' && fileMeta.downloaded_at.length > 0
          ? fileMeta.downloaded_at
          : null),
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

  async importTournament(payloadInput: TournamentPayload): Promise<ImportTournamentResult> {
    const payload = normalizeTournamentPayload(payloadInput, { nowDate: this.clock.todayJst() });
    const incomingDefHash = buildTournamentDefHash(payload);

    const existing = await this.query<{ tournament_uuid: string; def_hash: string }>(
      `SELECT tournament_uuid, def_hash
       FROM tournaments
       WHERE source_tournament_uuid = ?
       LIMIT 1`,
      [payload.uuid],
    );

    const decision = resolveImportMode2(existing[0]?.def_hash ?? null, incomingDefHash);
    if (decision === 'already_imported') {
      const existingTournamentUuid = existing[0]?.tournament_uuid;
      return existingTournamentUuid
        ? { status: 'already_imported', tournamentUuid: existingTournamentUuid }
        : { status: 'already_imported' };
    }
    if (decision === 'conflict') {
      const existingTournamentUuid = existing[0]?.tournament_uuid;
      return existingTournamentUuid
        ? { status: 'conflict', tournamentUuid: existingTournamentUuid }
        : { status: 'conflict' };
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
        play_style: string;
        difficulty: string;
        level: string;
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
        playStyle: row.play_style,
        difficulty: row.difficulty,
        level: row.level,
        isActive: Number(row.is_active),
      }));
    } finally {
      await this.client.close(dbId);
    }
  }

  private async getTournamentCharts(tournamentUuid: string): Promise<TournamentDetailChart[]> {
    const fileName = await this.getSongMasterDbFileName();
    if (!fileName) {
      const fallback = await this.query<{
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

      return fallback.map((row) => ({
        chartId: Number(row.chart_id),
        title: `chart:${row.chart_id}`,
        playStyle: '-',
        difficulty: '-',
        level: '-',
        submitted: Number(row.update_seq ?? 0) > 0 && Number(row.file_deleted ?? 0) === 0,
        updateSeq: Number(row.update_seq ?? 0),
        fileDeleted: Number(row.file_deleted ?? 0) === 1,
      }));
    }

    const dbId = await this.client.open({ filename: `file:${SONG_MASTER_DIR}/${fileName}?vfs=opfs&immutable=1` });
    try {
      const charts = await this.client.query<{
        chart_id: number;
        title: string;
        play_style: string;
        difficulty: string;
        level: string;
      }>({
        dbId,
        sql: `
          SELECT tc.chart_id, m.title, c.play_style, c.difficulty, c.level
          FROM tournament_charts tc
          LEFT JOIN chart c ON c.chart_id = tc.chart_id
          LEFT JOIN music m ON m.music_id = c.music_id
          WHERE tc.tournament_uuid = ?
          ORDER BY tc.tournament_chart_id ASC
        `,
        bind: [tournamentUuid],
      });

      const evidenceMap = await this.query<{
        chart_id: number;
        update_seq: number;
        file_deleted: number;
      }>(
        `SELECT chart_id, update_seq, file_deleted
         FROM evidences
         WHERE tournament_uuid = ?`,
        [tournamentUuid],
      );

      const evidenceByChartId = new Map<number, { updateSeq: number; fileDeleted: boolean }>();
      for (const evidence of evidenceMap) {
        evidenceByChartId.set(Number(evidence.chart_id), {
          updateSeq: Number(evidence.update_seq),
          fileDeleted: Number(evidence.file_deleted) === 1,
        });
      }

      return charts.map((chart) => {
        const evidence = evidenceByChartId.get(Number(chart.chart_id));
        const updateSeq = evidence?.updateSeq ?? 0;
        const fileDeleted = evidence?.fileDeleted ?? false;
        return {
          chartId: Number(chart.chart_id),
          title: chart.title ?? `chart:${chart.chart_id}`,
          playStyle: chart.play_style ?? '-',
          difficulty: chart.difficulty ?? '-',
          level: chart.level ?? '-',
          submitted: updateSeq > 0 && !fileDeleted,
          updateSeq,
          fileDeleted,
        };
      });
    } finally {
      await this.client.close(dbId);
    }
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
