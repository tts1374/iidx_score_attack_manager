export const PAYLOAD_VERSION = 1;
export const TOURNAMENT_TEXT_MAX = 50;
export const TOURNAMENT_MAX_CHARTS = 4;
export const ENCODED_PAYLOAD_MAX_BYTES = 4096;
export const DECOMPRESSED_PAYLOAD_MAX_BYTES = 16384;

export interface TournamentPayload {
  v: number;
  uuid: string;
  name: string;
  owner: string;
  hashtag: string;
  start: string;
  end: string;
  charts: number[];
}

export interface TournamentPayloadNormalizationOptions {
  nowDate?: string;
}
