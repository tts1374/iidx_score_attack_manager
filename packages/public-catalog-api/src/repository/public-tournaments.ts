import {
  countPublicTournamentChartStyles,
  type PublicTournamentListItem,
} from '@iidx/shared';

export interface PublicTournamentRecord {
  publicId: string;
  registryHash: string;
  payloadJson: string;
  name: string;
  owner: string;
  hashtag: string;
  startDate: string;
  endDate: string;
  chartCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deleteReason: string | null;
  deleteTokenHash: string | null;
}

export type PublicTournamentAuditResult =
  | 'accepted'
  | 'bad_request'
  | 'deleted'
  | 'duplicate'
  | 'internal_error'
  | 'invalid_json'
  | 'invalid_payload'
  | 'origin_rejected'
  | 'payload_too_large'
  | 'rate_limited'
  | 'unsupported_media_type';

export interface PublicTournamentAuditLogEntry {
  publicId: string | null;
  registryHash: string | null;
  result: PublicTournamentAuditResult;
  requestFingerprint: string;
  origin: string | null;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface PublicTournamentListCursorInput {
  createdAt: string;
  publicId: string;
}

export interface ListActivePublicTournamentsOptions {
  searchQuery: string | null;
  cursor: PublicTournamentListCursorInput | null;
  startDateFrom: string;
  limit: number;
}

export interface ListActivePublicTournamentsResult {
  items: PublicTournamentListItem[];
  hasMore: boolean;
}

export interface PublicTournamentRepository {
  countRecentAttempts(
    requestFingerprint: string,
    sinceInclusive: string,
  ): Promise<number>;
  getByRegistryHash(registryHash: string): Promise<PublicTournamentRecord | null>;
  getActiveByPublicId(publicId: string): Promise<PublicTournamentRecord | null>;
  listActive(
    options: ListActivePublicTournamentsOptions,
  ): Promise<ListActivePublicTournamentsResult>;
  create(record: PublicTournamentRecord): Promise<boolean>;
  softDeleteByPublicId(
    publicId: string,
    deleteTokenHash: string,
    deletedAt: string,
    deleteReason: string,
  ): Promise<boolean>;
  insertAuditLog(entry: PublicTournamentAuditLogEntry): Promise<void>;
}

interface CountRow {
  count: number | string;
}

interface PublicTournamentRow {
  public_id: string;
  registry_hash: string;
  payload_json: string;
  name: string;
  owner: string;
  hashtag: string;
  start_date: string;
  end_date: string;
  chart_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  delete_reason: string | null;
  delete_token_hash: string | null;
}

interface PublicTournamentListRow {
  public_id: string;
  payload_json: string;
  name: string;
  owner: string;
  hashtag: string;
  start_date: string;
  end_date: string;
  chart_count: number | string;
  created_at: string;
}

function mapPublicTournamentRow(row: PublicTournamentRow): PublicTournamentRecord {
  return {
    publicId: row.public_id,
    registryHash: row.registry_hash,
    payloadJson: row.payload_json,
    name: row.name,
    owner: row.owner,
    hashtag: row.hashtag,
    startDate: row.start_date,
    endDate: row.end_date,
    chartCount: row.chart_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deleteReason: row.delete_reason,
    deleteTokenHash: row.delete_token_hash,
  };
}

function mapPublicTournamentListRow(row: PublicTournamentListRow): PublicTournamentListItem {
  const chartStyleCounts = countPublicTournamentChartStylesFromPayloadJson(
    row.payload_json,
  );

  return {
    publicId: row.public_id,
    name: row.name,
    owner: row.owner,
    hashtag: row.hashtag,
    start: row.start_date,
    end: row.end_date,
    chartCount: Number(row.chart_count),
    spChartCount: chartStyleCounts.spChartCount,
    dpChartCount: chartStyleCounts.dpChartCount,
    createdAt: row.created_at,
  };
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function countPublicTournamentChartStylesFromPayloadJson(payloadJson: string): {
  spChartCount: number;
  dpChartCount: number;
} {
  try {
    const parsed = JSON.parse(payloadJson) as { charts?: unknown };
    if (!Array.isArray(parsed.charts)) {
      return { spChartCount: 0, dpChartCount: 0 };
    }
    return countPublicTournamentChartStyles(parsed.charts.map(Number));
  } catch {
    return { spChartCount: 0, dpChartCount: 0 };
  }
}

export class D1PublicTournamentRepository implements PublicTournamentRepository {
  constructor(private readonly db: D1Database) {}

  async countRecentAttempts(
    requestFingerprint: string,
    sinceInclusive: string,
  ): Promise<number> {
    const row = await this.db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM public_tournament_audit_logs
          WHERE request_fingerprint = ?
            AND created_at >= ?
            AND result != 'deleted'
        `,
      )
      .bind(requestFingerprint, sinceInclusive)
      .first<CountRow>();

    return Number(row?.count ?? 0);
  }

  async getByRegistryHash(
    registryHash: string,
  ): Promise<PublicTournamentRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT
            public_id,
            registry_hash,
            payload_json,
            name,
            owner,
            hashtag,
            start_date,
            end_date,
            chart_count,
            created_at,
            updated_at,
            deleted_at,
            delete_reason,
            delete_token_hash
          FROM public_tournaments
          WHERE registry_hash = ?
          LIMIT 1
        `,
      )
      .bind(registryHash)
      .first<PublicTournamentRow>();

    return row ? mapPublicTournamentRow(row) : null;
  }

  async getActiveByPublicId(publicId: string): Promise<PublicTournamentRecord | null> {
    const row = await this.db
      .prepare(
        `
          SELECT
            public_id,
            registry_hash,
            payload_json,
            name,
            owner,
            hashtag,
            start_date,
            end_date,
            chart_count,
            created_at,
            updated_at,
            deleted_at,
            delete_reason,
            delete_token_hash
          FROM public_tournaments
          WHERE public_id = ?
            AND deleted_at IS NULL
          LIMIT 1
        `,
      )
      .bind(publicId)
      .first<PublicTournamentRow>();

    return row ? mapPublicTournamentRow(row) : null;
  }

  async listActive(
    options: ListActivePublicTournamentsOptions,
  ): Promise<ListActivePublicTournamentsResult> {
    const trimmedSearch = options.searchQuery?.trim() ?? '';
    const searchPattern =
      trimmedSearch.length > 0 ? `%${escapeLikePattern(trimmedSearch)}%` : null;
    const rows =
      (
        await this.db
          .prepare(
            `
              SELECT
                public_id,
                payload_json,
                name,
                owner,
                hashtag,
                start_date,
                end_date,
                chart_count,
                created_at
              FROM public_tournaments
              WHERE deleted_at IS NULL
                AND start_date >= ?
                AND (
                  ? IS NULL
                  OR name LIKE ? ESCAPE '\\'
                  OR owner LIKE ? ESCAPE '\\'
                  OR hashtag LIKE ? ESCAPE '\\'
                )
                AND (
                  ? IS NULL
                  OR created_at < ?
                  OR (created_at = ? AND public_id < ?)
                )
              ORDER BY created_at DESC, public_id DESC
              LIMIT ?
            `,
          )
          .bind(
            options.startDateFrom,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            options.cursor?.createdAt ?? null,
            options.cursor?.createdAt ?? null,
            options.cursor?.createdAt ?? null,
            options.cursor?.publicId ?? null,
            options.limit + 1,
          )
          .all<PublicTournamentListRow>()
      ).results ?? [];

    return {
      items: rows.slice(0, options.limit).map(mapPublicTournamentListRow),
      hasMore: rows.length > options.limit,
    };
  }

  async create(record: PublicTournamentRecord): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          INSERT OR IGNORE INTO public_tournaments (
            public_id,
            registry_hash,
            payload_json,
            name,
            owner,
            hashtag,
            start_date,
            end_date,
            chart_count,
            created_at,
            updated_at,
            deleted_at,
            delete_reason,
            delete_token_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        record.publicId,
        record.registryHash,
        record.payloadJson,
        record.name,
        record.owner,
        record.hashtag,
        record.startDate,
        record.endDate,
        record.chartCount,
        record.createdAt,
        record.updatedAt,
        record.deletedAt,
        record.deleteReason,
        record.deleteTokenHash,
      )
      .run();

    return (result.meta.changes ?? 0) > 0;
  }

  async softDeleteByPublicId(
    publicId: string,
    deleteTokenHash: string,
    deletedAt: string,
    deleteReason: string,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `
          UPDATE public_tournaments
          SET deleted_at = ?,
              delete_reason = ?,
              updated_at = ?
          WHERE public_id = ?
            AND delete_token_hash = ?
            AND deleted_at IS NULL
        `,
      )
      .bind(deletedAt, deleteReason, deletedAt, publicId, deleteTokenHash)
      .run();

    return (result.meta.changes ?? 0) > 0;
  }

  async insertAuditLog(entry: PublicTournamentAuditLogEntry): Promise<void> {
    await this.db
      .prepare(
        `
          INSERT INTO public_tournament_audit_logs (
            public_id,
            registry_hash,
            result,
            request_fingerprint,
            origin,
            detail_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .bind(
        entry.publicId,
        entry.registryHash,
        entry.result,
        entry.requestFingerprint,
        entry.origin,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.createdAt,
      )
      .run();
  }
}
