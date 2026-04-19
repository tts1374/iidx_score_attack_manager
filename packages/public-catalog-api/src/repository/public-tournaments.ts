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

export interface PublicTournamentRepository {
  countRecentAttempts(
    requestFingerprint: string,
    sinceInclusive: string,
  ): Promise<number>;
  getByRegistryHash(registryHash: string): Promise<PublicTournamentRecord | null>;
  create(record: PublicTournamentRecord): Promise<boolean>;
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
  };
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
            delete_reason
          FROM public_tournaments
          WHERE registry_hash = ?
          LIMIT 1
        `,
      )
      .bind(registryHash)
      .first<PublicTournamentRow>();

    return row ? mapPublicTournamentRow(row) : null;
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
            delete_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      )
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
