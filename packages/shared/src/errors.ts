export type ErrorCode = string;
export type ErrorParams = Record<string, unknown>;

export interface AppErrorOptions {
  message?: string;
  params?: ErrorParams;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly params: ErrorParams | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const { message, params, cause } = options;
    if (cause === undefined) {
      super(message ?? code);
    } else {
      super(message ?? code, { cause });
    }
    this.name = new.target.name;
    this.code = code;
    this.params = params;
  }
}

export type PayloadValidationReason =
  | 'PAYLOAD_REQUIRED'
  | 'FIELD_TYPE'
  | 'FIELD_REQUIRED'
  | 'FIELD_TOO_LONG'
  | 'DATE_FORMAT'
  | 'UUID_INVALID'
  | 'CHARTS_TYPE'
  | 'CHARTS_REQUIRED'
  | 'CHARTS_TOO_MANY'
  | 'CHART_ID_INVALID'
  | 'CHARTS_DUPLICATE'
  | 'PAYLOAD_TYPE'
  | 'UNSUPPORTED_VERSION'
  | 'DATE_RANGE_INVALID'
  | 'PAST_TOURNAMENT';

export interface PayloadValidationParams extends ErrorParams {
  reason: PayloadValidationReason;
  field?: string;
  max?: number;
  version?: unknown;
}

export interface PayloadSizeParams extends ErrorParams {
  reason: 'encoded' | 'decompressed';
  limit: number;
  actual: number;
}

export class PayloadError extends AppError {}

export class PayloadBase64DecodeError extends PayloadError {
  constructor(options: Omit<AppErrorOptions, 'message'> = {}) {
    super('PAYLOAD_BASE64_DECODE_ERROR', {
      ...options,
      message: 'payload base64 decode failed',
    });
  }
}

export class PayloadGzipDecodeError extends PayloadError {
  constructor(options: Omit<AppErrorOptions, 'message'> = {}) {
    super('PAYLOAD_GZIP_DECODE_ERROR', {
      ...options,
      message: 'payload gzip decode failed',
    });
  }
}

export class PayloadJsonParseError extends PayloadError {
  constructor(options: Omit<AppErrorOptions, 'message'> = {}) {
    super('PAYLOAD_JSON_PARSE_ERROR', {
      ...options,
      message: 'payload json parse failed',
    });
  }
}

export class PayloadValidationError extends PayloadError {
  constructor(params: PayloadValidationParams, options: Omit<AppErrorOptions, 'message' | 'params'> = {}) {
    super('PAYLOAD_VALIDATION_ERROR', {
      ...options,
      message: 'payload validation failed',
      params,
    });
  }
}

export class PayloadSizeError extends PayloadError {
  constructor(params: PayloadSizeParams, options: Omit<AppErrorOptions, 'message' | 'params'> = {}) {
    super('PAYLOAD_SIZE_ERROR', {
      ...options,
      message: 'payload size exceeds limit',
      params,
    });
  }
}
