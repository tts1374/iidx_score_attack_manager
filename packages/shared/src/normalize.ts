import {
  PayloadValidationError,
} from './errors.js';
import {
  PAYLOAD_VERSION,
  TOURNAMENT_MAX_CHARTS,
  TOURNAMENT_TEXT_MAX,
  TournamentPayload,
  TournamentPayloadNormalizationOptions,
} from './types.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(input: unknown, field: string): string {
  if (typeof input !== 'string') {
    throw new PayloadValidationError(`${field} must be string`);
  }
  const normalized = input.trim().normalize('NFC');
  if (normalized.length === 0) {
    throw new PayloadValidationError(`${field} is required`);
  }
  if (normalized.length > TOURNAMENT_TEXT_MAX) {
    throw new PayloadValidationError(`${field} exceeds max length`);
  }
  return normalized;
}

function normalizeDate(input: unknown, field: string): string {
  if (typeof input !== 'string' || !ISO_DATE_RE.test(input)) {
    throw new PayloadValidationError(`${field} must be YYYY-MM-DD`);
  }
  return input;
}

function normalizeUuid(input: unknown): string {
  if (typeof input !== 'string' || !UUID_RE.test(input)) {
    throw new PayloadValidationError('uuid is invalid');
  }
  return input.toLowerCase();
}

function normalizeCharts(input: unknown): number[] {
  if (!Array.isArray(input)) {
    throw new PayloadValidationError('charts must be array');
  }
  if (input.length === 0) {
    throw new PayloadValidationError('charts is required');
  }
  if (input.length > TOURNAMENT_MAX_CHARTS) {
    throw new PayloadValidationError('charts exceeds max size');
  }

  const normalized = input.map((v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new PayloadValidationError('chart id must be positive integer');
    }
    return v;
  });

  const uniqueSorted = [...new Set(normalized)].sort((a, b) => a - b);
  if (uniqueSorted.length !== normalized.length) {
    throw new PayloadValidationError('charts contains duplicates');
  }
  return uniqueSorted;
}

export function normalizeTournamentPayload(
  payload: unknown,
  options: TournamentPayloadNormalizationOptions = {},
): TournamentPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new PayloadValidationError('payload must be object');
  }

  const raw = payload as Record<string, unknown>;
  const version = raw.v;
  if (version !== PAYLOAD_VERSION) {
    throw new PayloadValidationError(`unsupported payload version: ${version}`);
  }

  const start = normalizeDate(raw.start, 'start');
  const end = normalizeDate(raw.end, 'end');
  if (start > end) {
    throw new PayloadValidationError('start must be <= end');
  }
  if (options.nowDate && end < options.nowDate) {
    throw new PayloadValidationError('past tournament is not allowed');
  }

  return {
    v: PAYLOAD_VERSION,
    uuid: normalizeUuid(raw.uuid),
    name: normalizeText(raw.name, 'name'),
    owner: normalizeText(raw.owner, 'owner'),
    hashtag: normalizeText(raw.hashtag, 'hashtag'),
    start,
    end,
    charts: normalizeCharts(raw.charts),
  };
}

export function canonicalTournamentPayload(payload: TournamentPayload): TournamentPayload {
  return {
    v: payload.v,
    uuid: payload.uuid,
    name: payload.name,
    owner: payload.owner,
    hashtag: payload.hashtag,
    start: payload.start,
    end: payload.end,
    charts: [...payload.charts].sort((a, b) => a - b),
  };
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
