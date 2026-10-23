import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongMasterUpdateResult } from '@iidx/db';
import { encodeTournamentPayload } from '@iidx/shared';
import { buildImportRequestMessage, IMPORT_DELEGATION_STORAGE_REQUEST_KEY, IMPORT_DELEGATION_STORAGE_ACK_KEY } from './utils/import-delegation';

import { App } from './App';
import { AppServicesProvider } from './services/context';
import type { AppServices } from './services/app-services';
import { CURRENT_VERSION } from './version';
import { IMPORT_CONFIRM_PATH } from './utils/payload-url';

// Keep route assertions focused on App orchestration rather than child-page data loading.
vi.mock('./pages/SettingsPage', () => ({
  SettingsPage: ({ onCheckUpdate }: { onCheckUpdate: (force: boolean) => Promise<unknown> }) => (
    <div>
      <button onClick={() => void onCheckUpdate(false)}>manual update</button>
      <button onClick={() => void onCheckUpdate(true)}>force refetch</button>
    </div>
  ),
}));
vi.mock('./pages/PublicCatalogPage', () => ({ PublicCatalogPage: () => <div>catalog page</div> }));
vi.mock('./pages/CreateTournamentPage', () => ({ CreateTournamentPage: () => <div>create page</div> }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { resolve, promise };
}

function setup(hasCache = true) {
  let ready = hasCache;
  const updateIfNeeded = vi.fn(async (_force: boolean, _onDownloadStart?: () => void): Promise<SongMasterUpdateResult> => ({
    ok: true, source: 'up_to_date',
  }));
  const appDb = {
    getSetting: vi.fn(async () => null),
    setSetting: vi.fn(async () => undefined),
    getSongMasterMeta: vi.fn(async () => ready ? { song_master_file_name: 'songs.sqlite', song_master_sha256: 'abc' } : {}),
    hasSongMaster: vi.fn(async () => ready),
    getAutoDeleteConfig: vi.fn(async () => ({ enabled: false, days: 30 })),
    listTournaments: vi.fn(async () => []),
    reconcileEvidenceFiles: vi.fn(async () => undefined),
    reconcileInterruptedTournamentPublications: vi.fn(async () => undefined),
    purgeExpiredEvidenceIfNeeded: vi.fn(async () => 0),
    listSongMasterChartsByIds: vi.fn(async () => [{ chartId: 1001, title: 'Delegated song', playStyle: 'SP', difficulty: 'ANOTHER', level: '12' }]),
    findImportTargetTournament: vi.fn(async () => null),
    getAppDbUserVersion: vi.fn(async () => 1),
    getAppDbFileSize: vi.fn(async () => 1),
    getAppDbIntegrityCheck: vi.fn(async () => 'ok'),
  };
  const services = { appDb, songMasterService: { updateIfNeeded }, publicCatalogClient: { isAvailable: () => false }, opfs: {} } as unknown as AppServices;
  const mount = (webLockAcquired = false) => render(<AppServicesProvider services={services}><App webLockAcquired={webLockAcquired} /></AppServicesProvider>);
  return { updateIfNeeded, appDb, mount, setReady: (value: boolean) => { ready = value; } };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  localStorage.setItem('seen_version', CURRENT_VERSION);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}) });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'global-settings-menu' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '設定' }));
}

describe('App song master automation', () => {
  it('shows initial download, enables creation after success, and notifies once', async () => {
    const fixture = setup(false);
    const pending = deferred<SongMasterUpdateResult>();
    fixture.updateIfNeeded.mockImplementationOnce(async (_force, onDownloadStart) => {
      onDownloadStart?.();
      return pending.promise;
    });
    fixture.mount();
    expect(await screen.findByText('楽曲データを取得中です。')).toBeTruthy();
    fixture.setReady(true);
    await act(async () => pending.resolve({ ok: true, source: 'initial_download' }));
    expect(await screen.findByText('楽曲データを更新しました。')).toBeTruthy();
    expect(screen.queryByText('楽曲データを取得中です。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'スコアタアクション' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'スコアタを作成' }));
    expect(await screen.findByText('create page')).toBeTruthy();
    expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('announces an update only after the download starts and queues navigation until completion', async () => {
    const fixture = setup();
    const pending = deferred<SongMasterUpdateResult>();
    let startDownload: (() => void) | undefined;
    fixture.updateIfNeeded.mockImplementationOnce(async (_force, onDownloadStart) => {
      startDownload = onDownloadStart;
      return pending.promise;
    });
    fixture.mount();
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('新しい楽曲データが見つかったため更新中です。')).toBeNull();
    act(() => startDownload?.());
    expect(screen.getByText('新しい楽曲データが見つかったため更新中です。')).toBeTruthy();
    await openSettings();
    expect(screen.queryByText('manual update')).toBeNull();
    await act(async () => pending.resolve({ ok: true, source: 'github_download' }));
    expect(await screen.findByText('manual update')).toBeTruthy();
    expect(screen.getByText('楽曲データを更新しました。')).toBeTruthy();
  });

  it('coalesces repeated Settings requests during an update into one Back step', async () => {
    const fixture = setup();
    const pending = deferred<SongMasterUpdateResult>();
    fixture.updateIfNeeded.mockReturnValueOnce(pending.promise);
    fixture.mount();
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1));
    await openSettings();
    await openSettings();
    expect(screen.queryByText('manual update')).toBeNull();
    await act(async () => pending.resolve({ ok: true, source: 'up_to_date' }));
    expect(await screen.findByText('manual update')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    expect(await screen.findByRole('button', { name: 'global-settings-menu' })).toBeTruthy();
    expect(screen.queryByText('manual update')).toBeNull();
  });

  it('opens a delegated import immediately while postponing master reads until the update ends', async () => {
    const fixture = setup();
    const pending = deferred<SongMasterUpdateResult>();
    fixture.updateIfNeeded.mockReturnValueOnce(pending.promise);
    fixture.mount(true);
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1));
    await openSettings();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    const rawPayloadParam = encodeTournamentPayload({
      v: 1, uuid: crypto.randomUUID(), name: 'Delegated tournament', owner: 'QA', hashtag: 'qa', start: today, end: today, charts: [1001],
    });
    const request = buildImportRequestMessage({ requestId: 'review-delegation', senderTabId: 'sender-tab', rawPayloadParam });
    fireEvent(window, new StorageEvent('storage', {
      key: IMPORT_DELEGATION_STORAGE_REQUEST_KEY, newValue: JSON.stringify(request), storageArea: localStorage,
    }));
    expect(screen.getByRole('heading', { name: '取り込み確認' })).toBeTruthy();
    expect(window.location.pathname).toBe(IMPORT_CONFIRM_PATH);
    expect(JSON.parse(localStorage.getItem(IMPORT_DELEGATION_STORAGE_ACK_KEY)!)).toMatchObject({ type: 'IMPORT_ACK', requestId: request.requestId });
    expect(fixture.appDb.listSongMasterChartsByIds).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ ok: true, source: 'up_to_date' }));
    expect(await screen.findByText('Delegated song')).toBeTruthy();
    expect(fixture.appDb.listSongMasterChartsByIds).toHaveBeenCalledWith([1001]);
    expect(screen.queryByText('manual update')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(await screen.findByRole('button', { name: 'global-settings-menu' })).toBeTruthy();
  });

  it('defers the first check until the What is New dialog closes', async () => {
    localStorage.removeItem('seen_version');
    const fixture = setup();
    fixture.mount();
    await screen.findByRole('dialog');
    await waitFor(() => expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(1));
    expect(fixture.updateIfNeeded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1));
  });

  it.each(['filter', 'sort'] as const)('defers a resume check until the home %s overlay closes', async (overlay) => {
    const fixture = setup();
    fixture.mount();
    await waitFor(() => expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: overlay === 'filter' ? 'home-filter' : '並び替えを変更' }));
    const panel = await screen.findByRole(overlay === 'filter' ? 'dialog' : 'menu');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 6 * 60 * 1000);
    fireEvent.focus(window);
    expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(2));
  });

  it('keeps current checks quiet and allows a manual check and forced refetch within the interval', async () => {
    const fixture = setup();
    fixture.mount();
    await waitFor(() => expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('曲マスタは最新です。')).toBeNull();
    await openSettings();
    fireEvent.click(await screen.findByText('manual update'));
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByText('force refetch'));
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(3));
    expect(fixture.updateIfNeeded.mock.calls[2]?.[0]).toBe(true);
  });

  it('shows retry after a failed initial download and recovers without reloading', async () => {
    const fixture = setup(false);
    fixture.updateIfNeeded.mockResolvedValueOnce({ ok: false, source: 'initial_download', message: 'network_error' });
    fixture.mount();
    expect(await screen.findByText('楽曲データを取得できませんでした。通信状況を確認して再試行してください。')).toBeTruthy();
    fixture.setReady(true);
    fixture.updateIfNeeded.mockResolvedValueOnce({ ok: true, source: 'initial_download' });
    fireEvent.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByText('楽曲データを更新しました。')).toBeTruthy();
    expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(2);
  });

  it('coalesces manual checks while one is in flight', async () => {
    const fixture = setup();
    fixture.mount();
    await waitFor(() => expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(2));
    await openSettings();
    const pending = deferred<SongMasterUpdateResult>();
    fixture.updateIfNeeded.mockReturnValueOnce(pending.promise);
    fireEvent.click(await screen.findByText('manual update'));
    fireEvent.click(screen.getByText('manual update'));
    fireEvent.click(screen.getByText('force refetch'));
    expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve({ ok: true, source: 'up_to_date' }));
    expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(3);
  });

  it('does not immediately repeat a slow failed update when the app becomes idle', async () => {
    const fixture = setup(false);
    const pending = deferred<SongMasterUpdateResult>();
    fixture.updateIfNeeded.mockReturnValueOnce(pending.promise);
    fixture.mount();
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1));
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000);
    await act(async () => pending.resolve({ ok: false, source: 'initial_download', message: 'network_error' }));
    fireEvent.focus(window);
    expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy();
  });

  it.each([
    { ok: true, source: 'local_cache', message: 'network_error' },
    { ok: false, source: 'github_download', message: 'schema_mismatch' },
  ] as const)('keeps cached data usable on $message', async (result) => {
    const fixture = setup();
    fixture.updateIfNeeded.mockResolvedValueOnce(result);
    fixture.mount();
    expect(await screen.findByText(result.message === 'schema_mismatch'
      ? 'この楽曲データは現在のアプリに対応していません。アプリの更新を確認してください。'
      : '楽曲データを更新できませんでした。保存済みのデータを使用しています。')).toBeTruthy();
    await openSettings();
    expect(await screen.findByText('manual update')).toBeTruthy();
  });

  it('defers initial automatic checks on a direct import entry until returning home', async () => {
    window.history.replaceState(null, '', IMPORT_CONFIRM_PATH);
    const fixture = setup();
    fixture.mount();
    await waitFor(() => expect(fixture.appDb.hasSongMaster).toHaveBeenCalledTimes(1));
    expect(fixture.updateIfNeeded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'back' }));
    await waitFor(() => expect(fixture.updateIfNeeded).toHaveBeenCalledTimes(1));
  });
});
