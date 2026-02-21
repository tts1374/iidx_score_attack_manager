export const IMPORT_DELEGATION_CHANNEL = 'iidx_score_attack_manager';
export const IMPORT_DELEGATION_STORAGE_REQUEST_KEY = 'iidx:import:pending';
export const IMPORT_DELEGATION_STORAGE_ACK_KEY = 'iidx:import:pending_ack';
export const IMPORT_DELEGATION_BROADCAST_ACK_TIMEOUT_MS = 900;
export const IMPORT_DELEGATION_STORAGE_ACK_TIMEOUT_MS = 1200;

export interface ImportRequestMessage {
  type: 'IMPORT_REQUEST';
  requestId: string;
  senderTabId: string;
  rawPayloadParam: string;
  sentAt: number;
}

export interface ImportAckMessage {
  type: 'IMPORT_ACK';
  requestId: string;
  receiverTabId: string;
  via: 'broadcast' | 'storage';
  sentAt: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildImportRequestMessage(args: {
  requestId: string;
  senderTabId: string;
  rawPayloadParam: string;
}): ImportRequestMessage {
  return {
    type: 'IMPORT_REQUEST',
    requestId: args.requestId,
    senderTabId: args.senderTabId,
    rawPayloadParam: args.rawPayloadParam,
    sentAt: Date.now(),
  };
}

export function buildImportAckMessage(args: {
  requestId: string;
  receiverTabId: string;
  via: ImportAckMessage['via'];
}): ImportAckMessage {
  return {
    type: 'IMPORT_ACK',
    requestId: args.requestId,
    receiverTabId: args.receiverTabId,
    via: args.via,
    sentAt: Date.now(),
  };
}

export function isImportRequestMessage(value: unknown): value is ImportRequestMessage {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    value.type === 'IMPORT_REQUEST' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.senderTabId === 'string' &&
    value.senderTabId.length > 0 &&
    typeof value.rawPayloadParam === 'string' &&
    value.rawPayloadParam.length > 0 &&
    typeof value.sentAt === 'number'
  );
}

export function isImportAckMessage(value: unknown): value is ImportAckMessage {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    value.type === 'IMPORT_ACK' &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    typeof value.receiverTabId === 'string' &&
    value.receiverTabId.length > 0 &&
    (value.via === 'broadcast' || value.via === 'storage') &&
    typeof value.sentAt === 'number'
  );
}

export function parseImportRequestStorageValue(value: string | null): ImportRequestMessage | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isImportRequestMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseImportAckStorageValue(value: string | null): ImportAckMessage | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isImportAckMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
