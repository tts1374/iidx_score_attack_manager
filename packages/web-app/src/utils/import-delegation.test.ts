import { describe, expect, it } from 'vitest';

import {
  buildImportAckMessage,
  buildImportRequestMessage,
  isImportAckMessage,
  isImportRequestMessage,
  parseImportAckStorageValue,
  parseImportRequestStorageValue,
} from './import-delegation';

describe('import delegation utility', () => {
  it('builds and validates request messages', () => {
    const request = buildImportRequestMessage({
      requestId: 'request-1',
      senderTabId: 'tab-a',
      rawPayloadParam: 'abc%2Bdef',
    });
    expect(isImportRequestMessage(request)).toBe(true);
  });

  it('builds and validates ack messages', () => {
    const ack = buildImportAckMessage({
      requestId: 'request-1',
      receiverTabId: 'tab-b',
      via: 'broadcast',
    });
    expect(isImportAckMessage(ack)).toBe(true);
  });

  it('parses storage values safely', () => {
    const request = buildImportRequestMessage({
      requestId: 'request-2',
      senderTabId: 'tab-a',
      rawPayloadParam: 'payload',
    });
    const ack = buildImportAckMessage({
      requestId: 'request-2',
      receiverTabId: 'tab-b',
      via: 'storage',
    });
    expect(parseImportRequestStorageValue(JSON.stringify(request))?.requestId).toBe('request-2');
    expect(parseImportAckStorageValue(JSON.stringify(ack))?.requestId).toBe('request-2');
  });

  it('returns null for malformed storage payloads', () => {
    expect(parseImportRequestStorageValue('{')).toBeNull();
    expect(parseImportAckStorageValue('{"type":"x"}')).toBeNull();
    expect(parseImportRequestStorageValue(null)).toBeNull();
  });
});
