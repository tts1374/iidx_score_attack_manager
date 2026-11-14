import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Root } from 'react-dom/client';

const state = vi.hoisted(() => ({
  roots: [] as Root[],
  acquireLock: vi.fn(async () => () => undefined),
  createServices: vi.fn(),
  resolveImport: vi.fn((): { status: string; [key: string]: unknown } => ({ status: 'none' })),
}));

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, default: { ...actual, createRoot: (...args: Parameters<typeof actual.createRoot>) => {
    const root = actual.createRoot(...args);
    state.roots.push(root);
    return root;
  } } };
});
vi.mock('@iidx/db', () => ({
  acquireSingleTabLock: state.acquireLock,
  checkRuntimeCapabilities: () => ({ webLocks: true, opfs: true, crossOriginIsolated: true, wasm: true, serviceWorker: true }),
}));
vi.mock('./services/app-services', () => ({ createAppServices: state.createServices }));
vi.mock('./services/context', () => ({ AppServicesProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./utils/import-confirm', () => ({ resolveImportPayloadFromLocation: state.resolveImport }));
vi.mock('./App', () => ({
  App: () => <div>TEST_APP_READY</div>,
  AppFallbackUnsupported: () => <div>TEST_UNSUPPORTED</div>,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  state.acquireLock.mockResolvedValue(() => undefined);
  state.resolveImport.mockReturnValue({ status: 'none' });
  state.createServices.mockResolvedValue({ appDb: { getSetting: async () => 'ja', dispose: async () => undefined } });
});

afterEach(() => {
  state.roots.splice(0).forEach((root) => root.unmount());
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('initial local consent', () => {
  it('keeps notices visible and requires consent again after unchecking before starting once', async () => {
    const user = userEvent.setup();
    await import('./main');
    const start = await screen.findByRole('button', { name: 'はじめる' });
    const check = screen.getByRole('checkbox', { name: '上記を理解しました' });
    expect(screen.getByText('データはご利用中のブラウザ内に保存されます')).toBeTruthy();
    expect(screen.getByText('サーバーへの自動同期は行われません')).toBeTruthy();
    expect(screen.getByText('端末変更やブラウザデータ削除で消える場合があります')).toBeTruthy();
    expect(screen.queryByText(/バックアップ/)).toBeNull();
    expect(screen.queryByText(/QRコード/)).toBeNull();
    expect((check as HTMLInputElement).checked).toBe(false);
    expect((start as HTMLButtonElement).disabled).toBe(true);
    await user.click(start);
    expect(state.createServices).not.toHaveBeenCalled();
    await user.tab();
    expect(document.activeElement).toBe(check);
    await user.keyboard(' ');
    expect((check as HTMLInputElement).checked).toBe(true);
    expect((start as HTMLButtonElement).disabled).toBe(false);
    await user.click(check);
    expect((start as HTMLButtonElement).disabled).toBe(true);
    await user.click(check);
    await user.dblClick(start);
    await screen.findByText('TEST_APP_READY');
    expect(window.localStorage.getItem('tutorial_done')).toBe('1');
    expect(state.createServices).toHaveBeenCalledTimes(1);
    expect(state.acquireLock).toHaveBeenCalledTimes(1);
    expect(state.acquireLock).toHaveBeenCalledWith('iidx-score-attack-web-lock');
  });

  it.each([null, '0', 'invalid'])('shows consent for stored value %s', async (value) => {
    if (value !== null) window.localStorage.setItem('tutorial_done', value);
    await import('./main');
    await screen.findByRole('checkbox', { name: '上記を理解しました' });
    expect(state.acquireLock).not.toHaveBeenCalled();
    expect(state.createServices).not.toHaveBeenCalled();
  });

  it('skips consent only for the existing completed value', async () => {
    window.localStorage.setItem('tutorial_done', '1');
    await import('./main');
    await screen.findByText('TEST_APP_READY');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(state.createServices).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 'none' },
    { status: 'ready', rawPayloadParam: 'encoded-test-payload', payload: { name: 'Test', charts: [] } },
    { status: 'invalid', error: { code: 'INVALID_TEST', message: 'Invalid test link' } },
  ])('preserves startup and location resolution for $status links after consent', async (result) => {
    state.resolveImport.mockReturnValue(result);
    const user = userEvent.setup();
    await import('./main');
    await user.click(await screen.findByRole('checkbox', { name: '上記を理解しました' }));
    await user.click(screen.getByRole('button', { name: 'はじめる' }));
    await screen.findByText('TEST_APP_READY');
    expect(state.resolveImport).toHaveBeenCalledTimes(1);
    expect(state.resolveImport).toHaveBeenCalledWith({ pathname: window.location.pathname, search: window.location.search });
    expect(state.acquireLock).toHaveBeenCalledTimes(1);
    expect(state.createServices).toHaveBeenCalledTimes(1);
  });

  it('keeps an invalid import on its existing error screen when another tab holds the lock', async () => {
    state.resolveImport.mockReturnValue({ status: 'invalid', error: { code: 'INVALID_TEST', message: 'Invalid test link' } });
    state.acquireLock.mockRejectedValue(new Error('held'));
    const user = userEvent.setup();
    await import('./main');
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'はじめる' }));
    await screen.findByText('Invalid test link');
    expect(screen.getByText('INVALID_TEST')).toBeTruthy();
    expect(state.createServices).not.toHaveBeenCalled();
  });

  it.each([
    ['ja', '上記を理解しました', 'はじめる', 'ブラウザ内', '自動同期', '消える'],
    ['en', 'I understand the above', 'Start', 'browser', 'automatic server sync', 'erase data'],
    ['ko', '위 내용을 이해했습니다', '시작하기', '브라우저', '자동 동기화', '사라질'],
  ] as const)('aligns %s notices and accessible controls', async (language, label, startName, storage, sync, loss) => {
    await import('./main');
    await screen.findByRole('checkbox');
    const { ensureI18n } = await import('./i18n');
    await ensureI18n(language);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: label })).toBeTruthy());
    expect((screen.getByRole('button', { name: startName }) as HTMLButtonElement).disabled).toBe(true);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    [storage, sync, loss].forEach((text, index) => expect(items[index]?.textContent).toContain(text));
  });
});
