import type { TFunction } from 'i18next';
import {
  AppError,
  PayloadBase64DecodeError,
  PayloadGzipDecodeError,
  PayloadJsonParseError,
  PayloadSizeError,
  PayloadValidationError,
  type TournamentValidationCode,
  type TournamentValidationIssue,
} from '@iidx/shared';

export interface ErrorI18nSpec {
  key: string;
  params?: Record<string, unknown>;
}

const TOURNAMENT_VALIDATION_KEY_MAP: Record<TournamentValidationCode, string> = {
  TOURNAMENT_NAME_REQUIRED: 'validation.tournament.name_required',
  TOURNAMENT_NAME_TOO_LONG: 'validation.tournament.name_too_long',
  TOURNAMENT_OWNER_REQUIRED: 'validation.tournament.owner_required',
  TOURNAMENT_OWNER_TOO_LONG: 'validation.tournament.owner_too_long',
  TOURNAMENT_HASHTAG_REQUIRED: 'validation.tournament.hashtag_required',
  TOURNAMENT_START_DATE_FORMAT: 'validation.tournament.start_date_invalid_format',
  TOURNAMENT_END_DATE_FORMAT: 'validation.tournament.end_date_invalid_format',
  TOURNAMENT_DATE_RANGE_INVALID: 'validation.tournament.date_range_invalid',
  TOURNAMENT_PAST_DATE_NOT_ALLOWED: 'validation.tournament.past_date_not_allowed',
  TOURNAMENT_CHART_REQUIRED: 'validation.tournament.chart_required',
  TOURNAMENT_CHART_TOO_MANY: 'validation.tournament.chart_too_many',
  TOURNAMENT_CHART_DUPLICATE: 'validation.tournament.chart_duplicate',
};

function resolveTournamentValidationSpec(issue: TournamentValidationIssue): ErrorI18nSpec {
  const key = TOURNAMENT_VALIDATION_KEY_MAP[issue.code] ?? 'validation.out_of_range';
  if (issue.params) {
    return {
      key,
      params: issue.params,
    };
  }
  return { key };
}

function resolvePayloadValidationSpec(error: PayloadValidationError): ErrorI18nSpec {
  const reason = typeof error.params?.reason === 'string' ? error.params.reason : '';
  if (reason === 'PAYLOAD_REQUIRED') {
    return { key: 'error.import.url_invalid' };
  }
  if (reason === 'UNSUPPORTED_VERSION') {
    return { key: 'error.import.unsupported_version' };
  }
  return { key: 'error.import.payload_invalid' };
}

export function resolveErrorI18nSpec(error: unknown, fallbackKey = 'error.unknown'): ErrorI18nSpec {
  if (error instanceof PayloadBase64DecodeError) {
    return { key: 'error.import.url_invalid' };
  }
  if (error instanceof PayloadGzipDecodeError || error instanceof PayloadJsonParseError) {
    return { key: 'error.import.payload_invalid' };
  }
  if (error instanceof PayloadSizeError) {
    return { key: 'error.import.payload_too_large' };
  }
  if (error instanceof PayloadValidationError) {
    return resolvePayloadValidationSpec(error);
  }
  if (error instanceof AppError) {
    if (error.code === 'TOURNAMENT_VALIDATION_FAILED') {
      const issue = error.params?.issue;
      if (issue && typeof issue === 'object' && 'code' in issue) {
        return resolveTournamentValidationSpec(issue as TournamentValidationIssue);
      }
      return { key: 'validation.check_input' };
    }
    if (error.code === 'IMAGE_CANVAS_CONTEXT_UNAVAILABLE') {
      return { key: 'error.image.canvas_context_unavailable' };
    }
    if (error.code === 'IMAGE_JPEG_ENCODE_FAILED') {
      return { key: 'error.image.jpeg_encode_failed' };
    }
    if (error.code === 'EVIDENCE_IMAGE_NOT_FOUND') {
      return { key: 'error.image.evidence_not_found' };
    }
    if (error.code === 'CLIPBOARD_UNAVAILABLE') {
      return { key: 'error.clipboard.unavailable' };
    }
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return { key: 'error.storage.quota_exceeded' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { key: 'error.network.offline' };
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      key: 'error.description.with_detail',
      params: { message: error.message },
    };
  }
  return { key: fallbackKey };
}

export function resolveErrorMessage(t: TFunction, error: unknown, fallbackKey = 'error.unknown'): string {
  const spec = resolveErrorI18nSpec(error, fallbackKey);
  if (spec.params) {
    return t(spec.key, spec.params);
  }
  return t(spec.key);
}
