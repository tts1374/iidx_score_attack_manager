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
const LEADING_HASHTAG_RE = /^[#＃]+/u;
const EDGE_SPACE_RE = /^[\s\u3000]+|[\s\u3000]+$/gu;
const ALL_SPACE_RE = /[\s\u3000]+/gu;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/gu;

function normalizeText(input: unknown, field: string): string {
  if (typeof input !== 'string') {
    throw new PayloadValidationError({ reason: 'FIELD_TYPE', field });
  }
  const normalized = input.trim().normalize('NFC');
  if (normalized.length === 0) {
    throw new PayloadValidationError({ reason: 'FIELD_REQUIRED', field });
  }
  if (normalized.length > TOURNAMENT_TEXT_MAX) {
    throw new PayloadValidationError({ reason: 'FIELD_TOO_LONG', field, max: TOURNAMENT_TEXT_MAX });
  }
  return normalized;
}

export function normalizeHashtag(value: string): string {
  let normalized = value;
  normalized = normalized.replace(LEADING_HASHTAG_RE, '');
  normalized = normalized.normalize('NFKC');
  normalized = normalized.replace(EDGE_SPACE_RE, '');
  normalized = normalized.replace(ALL_SPACE_RE, '');
  normalized = normalized.replace(CONTROL_CHAR_RE, '');
  normalized = normalized.replace(LEADING_HASHTAG_RE, '');
  if (normalized.length > TOURNAMENT_TEXT_MAX) {
    normalized = normalized.slice(0, TOURNAMENT_TEXT_MAX);
  }
  return normalized;
}

export function formatHashtagForDisplay(value: string): string {
  const normalized = normalizeHashtag(value);
  if (normalized.length === 0) {
    return '';
  }
  return `#${normalized}`;
}

function normalizeHashtagField(input: unknown, field: string): string {
  if (typeof input !== 'string') {
    throw new PayloadValidationError({ reason: 'FIELD_TYPE', field });
  }
  const normalized = normalizeHashtag(input);
  if (normalized.length === 0) {
    throw new PayloadValidationError({ reason: 'FIELD_REQUIRED', field });
  }
  return normalized;
}

function normalizeDate(input: unknown, field: string): string {
  if (typeof input !== 'string' || !ISO_DATE_RE.test(input)) {
    throw new PayloadValidationError({ reason: 'DATE_FORMAT', field });
  }
  return input;
}

function normalizeUuid(input: unknown): string {
  if (typeof input !== 'string' || !UUID_RE.test(input)) {
    throw new PayloadValidationError({ reason: 'UUID_INVALID', field: 'uuid' });
  }
  return input.toLowerCase();
}

function normalizeCharts(input: unknown): number[] {
  if (!Array.isArray(input)) {
    throw new PayloadValidationError({ reason: 'CHARTS_TYPE', field: 'charts' });
  }
  if (input.length === 0) {
    throw new PayloadValidationError({ reason: 'CHARTS_REQUIRED', field: 'charts' });
  }
  if (input.length > TOURNAMENT_MAX_CHARTS) {
    throw new PayloadValidationError({ reason: 'CHARTS_TOO_MANY', field: 'charts', max: TOURNAMENT_MAX_CHARTS });
  }

  const normalized = input.map((v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new PayloadValidationError({ reason: 'CHART_ID_INVALID', field: 'charts' });
    }
    return v;
  });

  const uniqueChartIds = new Set(normalized);
  if (uniqueChartIds.size !== normalized.length) {
    throw new PayloadValidationError({ reason: 'CHARTS_DUPLICATE', field: 'charts' });
  }
  return normalized;
}

export function normalizeTournamentPayload(
  payload: unknown,
  options: TournamentPayloadNormalizationOptions = {},
): TournamentPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new PayloadValidationError({ reason: 'PAYLOAD_TYPE' });
  }

  const raw = payload as Record<string, unknown>;
  const version = raw.v;
  if (version !== PAYLOAD_VERSION) {
    throw new PayloadValidationError({ reason: 'UNSUPPORTED_VERSION', version });
  }

  const start = normalizeDate(raw.start, 'start');
  const end = normalizeDate(raw.end, 'end');
  if (start > end) {
    throw new PayloadValidationError({ reason: 'DATE_RANGE_INVALID' });
  }
  if (options.nowDate && end < options.nowDate) {
    throw new PayloadValidationError({ reason: 'PAST_TOURNAMENT' });
  }

  return {
    v: PAYLOAD_VERSION,
    uuid: normalizeUuid(raw.uuid),
    name: normalizeText(raw.name, 'name'),
    owner: normalizeText(raw.owner, 'owner'),
    hashtag: normalizeHashtagField(raw.hashtag, 'hashtag'),
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
  // 曲マスタ側(title_search_key)と同一仕様に固定する。
  // 変更時は互換影響があるため、この関数のみを更新すること。
  const replacementMap: Record<string, string> = {
    ä: 'a',
    ö: 'o',
    ü: 'u',
    ß: 'ss',
    æ: 'ae',
    œ: 'oe',
    ø: 'o',
    å: 'a',
    ç: 'c',
    ñ: 'n',
    á: 'a',
    à: 'a',
    â: 'a',
    ã: 'a',
    é: 'e',
    è: 'e',
    ê: 'e',
    ë: 'e',
    í: 'i',
    ì: 'i',
    î: 'i',
    ï: 'i',
    ó: 'o',
    ò: 'o',
    ô: 'o',
    õ: 'o',
    ú: 'u',
    ù: 'u',
    û: 'u',
    ý: 'y',
    ÿ: 'y',
  };

  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[äöüßæœøåçñáàâãéèêëíìîïóòôõúùûýÿ]/g, (char) => replacementMap[char] ?? char)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  return normalized;
}
