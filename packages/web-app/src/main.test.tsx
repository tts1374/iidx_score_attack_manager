import React from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Root } from 'react-dom/client';
import { PAYLOAD_VERSION, buildTournamentDefHash, encodeTournamentPayload } from '@iidx/shared';
import i18n from './i18n';

const mocks = vi.hoisted(() => ({
  capability: vi.fn(), lock: vi.fn(), services: vi.fn(), reload: vi.fn(), release: vi.fn(),
  roots: [] as Root[],
}));
vi.mock('@iidx/db', () => ({ checkRuntimeCapabilities: mocks.capability, acquireSingleTabLock: mocks.lock }));
vi.mock('./services/app-services', () => ({ createAppServices: mocks.services }));
vi.mock('./services/context', () => ({ AppServicesProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./App', async () => {
  const { UnsupportedScreen } = await import('./components/UnsupportedScreen');
  return { App: () => <h1>Application ready</h1>, AppFallbackUnsupported: UnsupportedScreen };
});
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { default: { createRoot: (element: HTMLElement) => {
    const root = actual.createRoot(element);
    mocks.roots.push(root);
    return root;
  } } };
});

const capable = { webLocks: true, opfs: true, crossOriginIsolated: true, wasm: true, serviceWorker: true };
let serviceWorker: { register: ReturnType<typeof vi.fn>; controller: object | null; ready: Promise<unknown>; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('DEV', true);
  document.body.innerHTML = '<div id="root"></div>';
  localStorage.setItem('tutorial_done', '1');
  sessionStorage.clear();
  vi.stubGlobal('location', { pathname: '/iidx_score_attack_manager/', search: '', reload: mocks.reload });
  vi.stubGlobal('crossOriginIsolated', true);
  mocks.capability.mockReturnValue(capable);
  mocks.lock.mockResolvedValue(mocks.release);
  mocks.services.mockResolvedValue({ appDb: { getSetting: vi.fn().mockResolvedValue('ja'), dispose: vi.fn() } });
  serviceWorker = { register: vi.fn().mockResolvedValue({}), controller: {}, ready: Promise.resolve({}), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
});

afterEach(async () => {
  await act(async () => { for (const root of mocks.roots.splice(0)) root.unmount(); });
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function boot() {
  await act(async () => { await import('./main'); });
}

async function heading(key: string) {
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(i18n.t(key)));
}

describe('bootstrap display handoff (isolated services and browser APIs)', () => {
  it('starts normally, registering once and acquiring the existing named lock once', async () => {
    vi.stubEnv('DEV', false);
    await boot();
    await screen.findByRole('heading', { name: 'Application ready' });
    expect(serviceWorker.register).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledWith('iidx-score-attack-web-lock');
    expect(mocks.services).toHaveBeenCalledTimes(1);
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('passes multiple unavailable features before lock acquisition', async () => {
    mocks.capability.mockReturnValue({ ...capable, webLocks: false, opfs: false });
    await boot();
    await heading('common.startup_failure.capabilities.title');
    await act(async () => { screen.getByRole('button', { name: i18n.t('common.technical_info') }).click(); });
    expect(screen.getByText('Web Locks API')).toBeTruthy();
    expect(screen.getByText('OPFS')).toBeTruthy();
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it('shows the other-tab state for a normal second launch', async () => {
    mocks.lock.mockRejectedValue(new Error('busy'));
    await boot();
    await heading('common.startup_failure.other_tab.title');
    expect(mocks.services).not.toHaveBeenCalled();
  });

  it.each(['no such vfs: opfs', 'unknown error', '', 'same timeout message'])(
    'classifies service failure without guessing the cause from arbitrary text: %j', async (message) => {
      mocks.services.mockRejectedValue(new Error(message === 'same timeout message' ? i18n.t('common.bootstrap.initialization_timeout') : message));
      await boot();
      await heading(`common.startup_failure.${message.includes('no such vfs: opfs') ? 'storage' : 'unexpected'}.title`);
    },
  );

  it('shows timeout only when the existing 20-second timer expires', async () => {
    vi.useFakeTimers();
    mocks.services.mockReturnValue(new Promise(() => {}));
    await boot();
    await act(async () => { await vi.advanceTimersByTimeAsync(19999); });
    expect(screen.queryByRole('heading')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(i18n.t('common.startup_failure.timeout.title'));
  });

  it.each(['unsupported', 'register_error', 'controller_timeout'] as const)('preserves setup branch %s and reload', async (reason) => {
    vi.stubEnv('DEV', false);
    if (reason === 'unsupported') Reflect.deleteProperty(navigator, 'serviceWorker');
    if (reason === 'register_error') serviceWorker.register.mockRejectedValue(new Error('registration diagnostic'));
    if (reason === 'controller_timeout') {
      vi.useFakeTimers();
      serviceWorker.controller = null;
      serviceWorker.ready = new Promise(() => {});
    }
    await boot();
    if (reason === 'controller_timeout') await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
    expect(screen.getByText(i18n.t(`common.service_worker_failure.reason.${reason}`))).toBeTruthy();
    expect(mocks.lock).not.toHaveBeenCalled();
    expect(serviceWorker.register).toHaveBeenCalledTimes(reason === 'unsupported' ? 0 : reason === 'register_error' ? 2 : 1);
    await act(async () => { screen.getByRole('button', { name: i18n.t('common.reload') }).click(); });
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the single COI auto-reload and then displays the environment failure', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('crossOriginIsolated', false);
    await boot();
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('coi_reload_attempt')).toBe('1');
    await act(async () => { mocks.roots.pop()!.unmount(); });
    vi.resetModules();
    await boot();
    await heading('common.startup_failure.isolation.title');
    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(mocks.lock).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps invalid import routing with lock busy=%s', async (busy) => {
    window.location.pathname = '/iidx_score_attack_manager/import/confirm';
    window.location.search = '?p=broken';
    if (busy) mocks.lock.mockRejectedValue(new Error('busy'));
    await boot();
    if (busy) await heading('common.invalid_import_link.title');
    else await screen.findByRole('heading', { name: 'Application ready' });
  });

  it.each([false, true])('keeps valid import routing with lock busy=%s', async (busy) => {
    const payload = { v: PAYLOAD_VERSION, uuid: '334b1da7-305b-4b77-93c4-d9222f58068b', name: 'Startup import', owner: 'Tester', hashtag: 'test', start: '2026-11-10', end: '2026-11-30', charts: [1001], def_hash: '' };
    payload.def_hash = await buildTournamentDefHash(payload);
    window.location.pathname = '/iidx_score_attack_manager/import/confirm';
    window.location.search = `?p=${await encodeTournamentPayload(payload)}`;
    if (busy) mocks.lock.mockRejectedValue(new Error('busy'));
    await boot();
    if (busy) {
      await heading('common.import_delegation.sending.title');
      expect(mocks.services).not.toHaveBeenCalled();
    } else await screen.findByRole('heading', { name: 'Application ready' });
  });
});
