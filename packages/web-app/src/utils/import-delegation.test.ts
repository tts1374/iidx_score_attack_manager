import { describe, expect, it } from 'vitest';

import {
  buildImportAckMessage,
  buildImportRequestMessage,
  buildTabFocusRequestMessage,
  isImportAckMessage,
  isImportRequestMessage,
  isTabFocusRequestMessage,
  parseImportAckStorageValue,
  parseImportRequestStorageValue,
  parseTabFocusRequestStorageValue,
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

  it('builds and validates tab focus request messages', () => {
    const request = buildTabFocusRequestMessage({
      requestId: 'request-focus-1',
      senderTabId: 'tab-c',
    });
    expect(isTabFocusRequestMessage(request)).toBe(true);
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
    const focusRequest = buildTabFocusRequestMessage({
      requestId: 'request-focus-2',
      senderTabId: 'tab-c',
    });
    expect(parseImportRequestStorageValue(JSON.stringify(request))?.requestId).toBe('request-2');
    expect(parseImportAckStorageValue(JSON.stringify(ack))?.requestId).toBe('request-2');
    expect(parseTabFocusRequestStorageValue(JSON.stringify(focusRequest))?.requestId).toBe('request-focus-2');
  });

  it('returns null for malformed storage payloads', () => {
    expect(parseImportRequestStorageValue('{')).toBeNull();
    expect(parseImportAckStorageValue('{"type":"x"}')).toBeNull();
    expect(parseTabFocusRequestStorageValue('{"type":"x"}')).toBeNull();
    expect(parseImportRequestStorageValue(null)).toBeNull();
  });
});
