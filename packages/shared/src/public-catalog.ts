import type { ErrorParams } from './errors.js';
import type { TournamentPayload } from './types.js';
import { sha256Text } from './hash.js';
import {
  canonicalTournamentPayload,
  normalizeTournamentPayload,
} from './normalize.js';

export type PublicTournamentRegisterRequest = TournamentPayload;

export type PublicTournamentRegisterStatus = 'created' | 'duplicate';

export interface PublicTournamentRegisterResponse {
  status: PublicTournamentRegisterStatus;
  publicId: string;
  deleteToken?: string;
}

export type PublicTournamentListCursor = string;

export interface PublicTournamentListItem {
  publicId: string;
  name: string;
  owner: string;
  hashtag: string;
  start: string;
  end: string;
  chartCount: number;
  spChartCount?: number;
  dpChartCount?: number;
  createdAt: string;
}

export interface PublicTournamentListResponse {
  items: PublicTournamentListItem[];
  nextCursor: PublicTournamentListCursor | null;
}

export interface PublicTournamentPayloadResponse {
  payloadParam: string;
}

export type PublicCatalogApiErrorCode =
  | 'BAD_REQUEST'
  | 'INVALID_JSON'
  | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'ORIGIN_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UNSUPPORTED_MEDIA_TYPE';

export interface PublicCatalogApiError {
  code: PublicCatalogApiErrorCode;
  message: string;
  details?: ErrorParams;
}

export interface PublicCatalogApiErrorResponse {
  error: PublicCatalogApiError;
}

export interface PublicTournamentRegistryCanonicalPayload {
  name: string;
  owner: string;
  hashtag: string;
  start: string;
  end: string;
  charts: number[];
}

export interface PublicTournamentChartStyleCounts {
  spChartCount: number;
  dpChartCount: number;
}

function resolvePublicTournamentChartPlayStyle(chartId: number): 'SP' | 'DP' | null {
  if (!Number.isInteger(chartId) || chartId <= 0) {
    return null;
  }

  // Song master chart ids are allocated as five SP slots then four DP slots per song.
  const chartSlot = (chartId - 1) % 9;
  return chartSlot < 5 ? 'SP' : 'DP';
}

export function countPublicTournamentChartStyles(
  chartIds: readonly number[],
): PublicTournamentChartStyleCounts {
  let spChartCount = 0;
  let dpChartCount = 0;

  for (const chartId of chartIds) {
    const playStyle = resolvePublicTournamentChartPlayStyle(chartId);
    if (playStyle === 'SP') {
      spChartCount += 1;
    } else if (playStyle === 'DP') {
      dpChartCount += 1;
    }
  }

  return {
    spChartCount,
    dpChartCount,
  };
}

export function canonicalPublicTournamentRegistryPayload(
  payload: TournamentPayload,
): PublicTournamentRegistryCanonicalPayload {
  const canonical = canonicalTournamentPayload(normalizeTournamentPayload(payload));

  return {
    name: canonical.name,
    owner: canonical.owner,
    hashtag: canonical.hashtag,
    start: canonical.start,
    end: canonical.end,
    charts: canonical.charts,
  };
}

export function buildPublicTournamentRegistryHash(payload: TournamentPayload): string {
  return sha256Text(
    JSON.stringify(canonicalPublicTournamentRegistryPayload(payload)),
  );
}
