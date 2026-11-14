import React from 'react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Root } from 'react-dom/client';
import { PAYLOAD_VERSION, buildTournamentDefHash, encodeTournamentPayload } from '@iidx/shared';
import {
  buildImportAckMessage,
  IMPORT_DELEGATION_BROADCAST_ACK_TIMEOUT_MS as BROADCAST_WAIT,
  IMPORT_DELEGATION_STORAGE_ACK_TIMEOUT_MS as STORAGE_WAIT,
  IMPORT_DELEGATION_STORAGE_REQUEST_KEY,
  IMPORT_DELEGATION_STORAGE_ACK_KEY,
} from './utils/import-delegation';

const mocks = vi.hoisted(() => ({
  lock: vi.fn(), services: vi.fn(), close: vi.fn(), home: vi.fn(),
  broadcast: vi.fn(), storage: vi.fn(), roots: [] as Root[],
}));
vi.mock('@iidx/db', () => ({
  checkRuntimeCapabilities: () => ({ webLocks: true, opfs: true, crossOriginIsolated: true, wasm: true, serviceWorker: true }),
  acquireSingleTabLock: mocks.lock,
}));
vi.mock('./services/app-services', () => ({ createAppServices: mocks.services }));
vi.mock('./App', () => ({ App: () => <h1>Application ready</h1>, AppFallbackUnsupported: () => <h1>Other startup failure</h1> }));
vi.mock('react-dom/client', async (original) => {
  const actual = await original<typeof import('react-dom/client')>();
  return { default: { createRoot: (element: HTMLElement) => {
    const root = actual.createRoot(element); mocks.roots.push(root); return root;
  } } };
});

let mode: 'broadcast' | 'storage' | 'none';
let i18n: typeof import('./i18n')['default'];
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.stubEnv('DEV', true);
  document.body.innerHTML = '<div id="root"></div>';
  localStorage.clear(); localStorage.setItem('tutorial_done', '1');
  mocks.lock.mockRejectedValue(new Error('lock busy'));
  vi.stubGlobal('location', { pathname: '/iidx_score_attack_manager/import/confirm', search: '', replace: mocks.home });
  vi.stubGlobal('close', mocks.close);
  mode = 'none';
  vi.stubGlobal('BroadcastChannel', class {
    listener: ((event: MessageEvent) => void) | undefined;
    addEventListener(_type: string, listener: (event: MessageEvent) => void) { this.listener = listener; }
    removeEventListener() { this.listener = undefined; }
    close() {}
    postMessage(request: { requestId: string }) {
      mocks.broadcast(request);
      if (mode === 'broadcast') queueMicrotask(() => this.listener?.(new MessageEvent('message', {
        data: buildImportAckMessage({ requestId: request.requestId, receiverTabId: 'receiver', via: 'broadcast' }),
      })));
    }
  });
  const originalSet = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    originalSet.call(this, key, value);
    if (key !== IMPORT_DELEGATION_STORAGE_REQUEST_KEY) return;
    mocks.storage(JSON.parse(value));
    if (mode === 'storage') queueMicrotask(() => window.dispatchEvent(new StorageEvent('storage', {
      key: IMPORT_DELEGATION_STORAGE_ACK_KEY, storageArea: localStorage,
      newValue: JSON.stringify(buildImportAckMessage({ requestId: JSON.parse(value).requestId, receiverTabId: 'receiver', via: 'storage' })),
    })));
  });
  i18n = (await import('./i18n')).default;
  await (await import('./i18n')).ensureI18n('ja');
});
afterEach(async () => {
  await act(async () => { for (const root of mocks.roots.splice(0)) root.unmount(); });
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

async function boot(owner = 'Organizer') {
  const payload = { v: PAYLOAD_VERSION, uuid: '334b1da7-305b-4b77-93c4-d9222f58068b', name: 'LongScoreAttack'.repeat(2), owner,
    hashtag: 'test', start: '2026-11-15', end: '2026-11-30', charts: [1001, 1002], def_hash: '' };
  payload.def_hash = await buildTournamentDefHash(payload);
  window.location.search = `?p=${await encodeTournamentPayload(payload)}`;
  vi.useFakeTimers();
  await act(async () => { await import('./main'); });
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function title(state: string) { return i18n.t(`common.import_delegation.${state}.title`); }

describe('import delegation entry with simulated communication (no app services or saving)', () => {
  it('keeps both waits, then shows preview, save warning, Home and one retry without guessing a cause', async () => {
    await boot('');
    expect(screen.getByRole('status').textContent).toContain(title('sending'));
    // React StrictMode starts the existing effect twice on mount; this PR preserves that count.
    expect(mocks.broadcast).toHaveBeenCalledTimes(2);
    await advance(BROADCAST_WAIT - 1);
    expect(mocks.storage).not.toHaveBeenCalled();
    await advance(1);
    expect(mocks.storage).toHaveBeenCalledTimes(2);
    await advance(STORAGE_WAIT - 1);
    expect(screen.getByRole('status').textContent).toContain(title('sending'));
    await advance(1);
    expect(screen.getByRole('status').textContent).toContain(title('failed'));
    expect(screen.getByText(i18n.t('common.import_delegation.preview.hint'))).toBeTruthy();
    expect(screen.getByText(i18n.t('common.import_delegation.preview.owner', { value: '-' }))).toBeTruthy();
    expect(screen.getByText(i18n.t('common.import_delegation.preview.chart_count', { count: 2 }))).toBeTruthy();
    expect(mocks.close).not.toHaveBeenCalled();
    await act(async () => screen.getByRole('button', { name: i18n.t('common.import_delegation.retry') }).click());
    expect(screen.getByRole('status').textContent).toContain(title('sending'));
    expect(mocks.broadcast).toHaveBeenCalledTimes(3);
    await advance(BROADCAST_WAIT + STORAGE_WAIT);
    expect(screen.getByRole('status').textContent).toContain(title('failed'));
    expect(mocks.storage).toHaveBeenCalledTimes(3);
    await act(async () => screen.getByRole('button', { name: i18n.t('common.import_delegation.open_home') }).click());
    expect(mocks.home).toHaveBeenCalledTimes(1);
    expect(mocks.home).toHaveBeenCalledWith('/iidx_score_attack_manager/');
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it.each(['broadcast', 'storage'] as const)('keeps %s acknowledgment and the 60ms close attempt; manual close remains usable', async (via) => {
    mode = via;
    await boot('Organizer'.repeat(3));
    if (via === 'storage') await advance(BROADCAST_WAIT);
    expect(screen.getByRole('status').textContent).toContain(title('success'));
    expect(screen.getByRole('status').textContent).toContain(i18n.t('common.import_delegation.success.description'));
    expect(screen.queryByText(i18n.t(`common.import_delegation.status.ack_${via}`))).toBeNull();
    expect(mocks.storage).toHaveBeenCalledTimes(via === 'storage' ? 2 : 0);
    await advance(59);
    expect(mocks.close).not.toHaveBeenCalled();
    await advance(1);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    await act(async () => screen.getByRole('button', { name: i18n.t('common.close_this_tab') }).click());
    expect(mocks.close).toHaveBeenCalledTimes(2);
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it.each(['broadcast', 'storage'] as const)('retries from no response to %s acknowledgment once', async (via) => {
    await boot(); await advance(BROADCAST_WAIT + STORAGE_WAIT);
    mode = via;
    await act(async () => screen.getByRole('button', { name: i18n.t('common.import_delegation.retry') }).click());
    if (via === 'storage') await advance(BROADCAST_WAIT);
    expect(screen.getByRole('status').textContent).toContain(title('success'));
    expect(mocks.broadcast).toHaveBeenCalledTimes(3);
    expect(mocks.storage).toHaveBeenCalledTimes(via === 'storage' ? 3 : 2);
    await advance(60); expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it.each(['ja', 'en', 'ko'] as const)('exposes localized results and accessible diagnostics with focus return in %s', async (language) => {
    await (await import('./i18n')).ensureI18n(language);
    mode = 'storage'; await boot(); await advance(BROADCAST_WAIT);
    vi.useRealTimers();
    const user = userEvent.setup();
    const help = screen.getByRole('button', { name: i18n.t('common.technical_info') });
    help.focus(); await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog').textContent).toContain(i18n.t('common.import_delegation.status.ack_storage'));
    expect(screen.queryByRole('main')).toBeNull();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(help);
    await user.click(help);
    await user.click(screen.getByRole('button', { name: i18n.t('common.close') }));
    expect(document.activeElement).toBe(help);
  });
});
