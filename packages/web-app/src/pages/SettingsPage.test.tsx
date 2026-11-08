import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';

import { SettingsPage } from './SettingsPage';
import i18n from '../i18n';

type SettingsPageProps = ComponentProps<typeof SettingsPage>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  void i18n.changeLanguage('ja');
});

function createProps(overrides: Partial<SettingsPageProps> = {}): SettingsPageProps {
  return {
    appInfo: {
      appVersion: '1.0.0-test',
      buildTime: '2026-02-19T00:00:00Z',
      swStatus: 'enabled',
      swVersion: 'sw-1',
      swScope: '/',
      swState: 'activated',
      swClientsClaim: true,
      swSkipWaiting: true,
      appDbUserVersion: 1,
      appDbSizeBytes: 1024,
      appDbIntegrityCheck: 'ok',
      webLocksStatus: 'acquired',
      webLocksReason: null,
      opfsStatus: 'available',
      storageUsageBytes: 1000,
      storageQuotaBytes: 2000,
    },
    songMasterMeta: {
      song_master_file_name: 'song.sqlite3',
      song_master_sha256: 'abc',
      song_master_downloaded_at: '2026-02-19T00:00:00Z',
      song_master_byte_size: '1024',
      song_master_schema_version: '1',
      song_master_generated_at: '2026-02-19T00:00:00Z',
      song_master_updated_at: '2026-02-19T00:00:00Z',
    },
    autoDeleteEnabled: true,
    autoDeleteDays: 30,
    language: 'ja',
    debugModeEnabled: false,
    busy: false,
    logs: [],
    lastCleanupResult: null,
    onCheckUpdate: vi.fn(async () => ({
      ok: true,
      source: 'manual',
      message: null,
      latestSha256: null,
      localSha256: null,
      checkedAt: '2026-02-19T00:00:00Z',
    })),
    onAutoDeleteConfigChange: vi.fn(async () => undefined),
    onEstimateStorageCleanup: vi.fn(async () => ({
      thresholdDate: '2026-01-01',
      targetTournamentCount: 0,
      targetImageCount: 0,
      estimatedReleaseBytes: 0,
      unknownSizeCount: 0,
    })),
    onRunStorageCleanup: vi.fn(async () => ({
      thresholdDate: '2026-01-01',
      deletedTournamentCount: 0,
      deletedImageCount: 0,
      releasedBytes: 0,
      unknownSizeCount: 0,
      executedAt: '2026-02-19T00:00:00Z',
    })),
    onLanguageChange: vi.fn(async () => undefined),
    onToggleDebugMode: vi.fn(),
    onApplyAppUpdate: vi.fn(),
    onResetLocalData: vi.fn(async () => undefined),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const estimate = {
  thresholdDate: '2026-01-01', targetTournamentCount: 2, targetImageCount: 3,
  estimatedReleaseBytes: 1024, unknownSizeCount: 1,
};

const result = {
  thresholdDate: '2026-01-01', deletedTournamentCount: 2, deletedImageCount: 3,
  releasedBytes: 1024, unknownSizeCount: 0, executedAt: '2026-02-19T00:00:00Z',
};

async function openCleanup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: i18n.t('settings.storage.action.cleanup') }));
  return screen.findByRole('dialog', { name: i18n.t('settings.storage.cleanup_dialog.title') });
}

async function confirmCleanup(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await openCleanup(user);
  await user.click(await within(dialog).findByRole('button', { name: i18n.t('settings.storage.cleanup_dialog.action.proceed') }));
  return screen.findByRole('dialog', { name: i18n.t('settings.storage.cleanup_confirm.title') });
}

async function openResetFinal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('settings-reset-open-button'));
  await user.click(screen.getByTestId('settings-reset-guide-next-button'));
  return screen.getByTestId('settings-reset-final-dialog');
}

describe('SettingsPage', () => {
  it.each([
    [{ webLocksStatus: 'not_acquired' }, 'web_locks_failed', 'restart'],
    [{ webLocksStatus: 'unsupported' }, 'web_locks_failed', 'restart'],
    [{ opfsStatus: 'error' }, 'opfs_error', 'restart'],
    [{ appDbIntegrityCheck: 'corrupt' }, 'db_integrity_error', 'restart'],
    [{ storageUsageBytes: 1900 }, 'capacity_critical', 'cleanup'],
  ] as const)('shows a user-facing reason and preserves the action for %o', (appInfo, reason, action) => {
    const props = createProps();
    render(<SettingsPage {...props} appInfo={{ ...props.appInfo, ...appInfo }} />);
    const card = within(screen.getByTestId('settings-health-summary-card'));
    expect(card.getByText(i18n.t(`settings.health.reason.${reason}`))).toBeTruthy();
    expect(card.getByRole('button', { name: i18n.t(`settings.health.action.${action}`) })).toBeTruthy();
    expect(card.getByText(i18n.t(`settings.health.hint.${action}`))).toBeTruthy();
    expect(card.queryByText(/Web Locks|OPFS|DB/)).toBeNull();
    expect(screen.queryByTestId('settings-technical-card')).toBeNull();
  });

  it('keeps the existing priority and two-reason limit', () => {
    const props = createProps();
    render(<SettingsPage {...props} songMasterMeta={{}} appInfo={{ ...props.appInfo, webLocksStatus: 'not_acquired', opfsStatus: 'error', storageUsageBytes: 1900 }} />);
    const card = within(screen.getByTestId('settings-health-summary-card'));
    expect(card.getByText(i18n.t('settings.health.reason.web_locks_failed'))).toBeTruthy();
    expect(card.getByText(i18n.t('settings.health.reason.song_unavailable'))).toBeTruthy();
    expect(card.queryByText(i18n.t('settings.health.reason.opfs_error'))).toBeNull();
    expect(card.getByRole('button', { name: i18n.t('settings.health.action.restart') })).toBeTruthy();
  });

  it('checks updates, rather than force-refetching, from the missing-song action', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    const props = createProps({ songMasterMeta: {} });
    render(<SettingsPage {...props} />);
    await user.click(within(screen.getByTestId('settings-health-summary-card')).getByRole('button', { name: i18n.t('settings.health.action.fetch_song') }));
    expect(props.onCheckUpdate).toHaveBeenCalledWith(false);
  });

  it('opens cleanup from the capacity warning and respects busy state', async () => {
    const user = userEvent.setup();
    const props = createProps();
    const info = { ...props.appInfo, storageUsageBytes: 1900 };
    const view = render(<SettingsPage {...props} appInfo={info} busy />);
    const action = () => within(screen.getByTestId('settings-health-summary-card')).getByRole('button');
    expect((action() as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<SettingsPage {...props} appInfo={info} />);
    await user.click(action());
    expect(props.onEstimateStorageCleanup).toHaveBeenCalledWith(30);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it.each(['ja', 'en', 'ko'] as const)('aligns deletion scope, counts, token and help labels in %s', async (language) => {
    await i18n.changeLanguage(language);
    const user = userEvent.setup();
    render(<SettingsPage {...createProps({ language, onEstimateStorageCleanup: vi.fn(async () => estimate) })} />);
    expect(screen.getByText(i18n.t('settings.storage.cleanup_scope'))).toBeTruthy();
    const help = screen.getByRole('button', { name: i18n.t('settings.storage.help.title') });
    help.focus();
    await user.keyboard('{Enter}');
    const helpDialog = await screen.findByRole('dialog', { name: i18n.t('settings.storage.help.title') });
    expect(within(helpDialog).getByText(i18n.t('settings.storage.help.description'))).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(help));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const dialog = await openCleanup(user);
    expect(await within(dialog).findByText(i18n.t('settings.storage.cleanup_dialog.target_tournament_count', { value: 2 }))).toBeTruthy();
    expect(within(dialog).getByText(i18n.t('settings.storage.cleanup_dialog.target_image_count', { value: 3 }))).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: i18n.t('common.close') }));
    await openResetFinal(user);
    await user.type(screen.getByTestId('settings-reset-confirm-input'), i18n.t('settings.danger.reset_confirm_token'));
    expect((screen.getByTestId('settings-reset-execute-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows estimating, blocks deletion for zero images, and closes without deleting', async () => {
    const user = userEvent.setup();
    const pending = deferred<typeof estimate>();
    const props = createProps({ onEstimateStorageCleanup: vi.fn(() => pending.promise) });
    render(<SettingsPage {...props} />);
    const dialog = await openCleanup(user);
    expect(within(dialog).getByRole('status').textContent).toBe(i18n.t('settings.storage.cleanup_dialog.loading'));
    const proceed = within(dialog).getByRole('button', { name: i18n.t('settings.storage.cleanup_dialog.action.proceed') });
    expect((proceed as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve({ ...estimate, targetImageCount: 0, targetTournamentCount: 0 }));
    expect(within(dialog).getByText(i18n.t('settings.storage.cleanup_dialog.empty'))).toBeTruthy();
    expect((proceed as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: i18n.t('common.close') }));
    expect(props.onRunStorageCleanup).not.toHaveBeenCalled();
  });

  it('shows estimate failure without placeholder counts and allows retry', async () => {
    const user = userEvent.setup();
    const onEstimateStorageCleanup = vi.fn().mockRejectedValueOnce(new Error('estimate failed')).mockResolvedValue(estimate);
    render(<SettingsPage {...createProps({ onEstimateStorageCleanup })} />);
    const dialog = await openCleanup(user);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).queryByText(/2026-01-01/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: i18n.t('settings.storage.cleanup_dialog.action.retry') }));
    expect(await within(dialog).findByText(i18n.t('settings.storage.cleanup_dialog.target_image_count', { value: 3 }))).toBeTruthy();
    expect(onEstimateStorageCleanup).toHaveBeenNthCalledWith(2, 30);
  });

  it('keeps unknown image sizes unknown instead of reporting zero bytes', async () => {
    const user = userEvent.setup();
    render(<SettingsPage {...createProps({ onEstimateStorageCleanup: vi.fn(async () => ({ ...estimate, estimatedReleaseBytes: null, unknownSizeCount: 3 })) })} />);
    const dialog = await openCleanup(user);
    expect(await within(dialog).findByText(i18n.t('settings.storage.cleanup_dialog.estimated_release', { size: i18n.t('common.unknown') }))).toBeTruthy();
    expect(within(dialog).getByText(i18n.t('settings.storage.cleanup_dialog.unknown_sizes', { value: 3 }))).toBeTruthy();
  });

  it('shows unknown released bytes and their count in the last cleanup details', async () => {
    const user = userEvent.setup();
    render(<SettingsPage {...createProps({ lastCleanupResult: { ...result, releasedBytes: null, unknownSizeCount: 3 } })} />);
    const storage = screen.getByText(i18n.t('settings.storage.title')).closest('.MuiCard-root') as HTMLElement;
    await user.click(within(storage).getByRole('button', { name: i18n.t('common.detail') }));
    expect(within(storage).getByText(i18n.t('common.unknown'))).toBeTruthy();
    expect(within(storage).getByText(i18n.t('settings.storage.detail.unknown_sizes', { value: 3 }))).toBeTruthy();
  });

  it('preserves deletion arguments, cancellation, in-progress guards and success', async () => {
    const user = userEvent.setup();
    const pending = deferred<typeof result>();
    const props = createProps({ autoDeleteDays: 60, onEstimateStorageCleanup: vi.fn(async () => estimate), onRunStorageCleanup: vi.fn(() => pending.promise) });
    const view = render(<SettingsPage {...props} />);
    let dialog = await confirmCleanup(user);
    expect(props.onEstimateStorageCleanup).toHaveBeenCalledWith(60);
    await user.click(within(dialog).getByRole('button', { name: i18n.t('common.cancel') }));
    expect(props.onRunStorageCleanup).not.toHaveBeenCalled();
    const estimateDialog = await screen.findByRole('dialog', { name: i18n.t('settings.storage.cleanup_dialog.title') });
    await user.click(within(estimateDialog).getByRole('button', { name: i18n.t('settings.storage.cleanup_dialog.action.proceed') }));
    dialog = await screen.findByRole('dialog', { name: i18n.t('settings.storage.cleanup_confirm.title') });
    await user.dblClick(within(dialog).getByRole('button', { name: i18n.t('settings.storage.cleanup_confirm.action.execute') }));
    expect(props.onRunStorageCleanup).toHaveBeenCalledTimes(1);
    expect(props.onRunStorageCleanup).toHaveBeenCalledWith(60);
    expect(within(dialog).getByRole('status').textContent).toBe(i18n.t('settings.storage.cleanup_confirm.running'));
    expect((within(dialog).getByRole('button', { name: i18n.t('common.cancel') }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: i18n.t('settings.storage.cleanup_confirm.title') })).toBeTruthy();
    await act(async () => pending.resolve(result));
    view.rerender(<SettingsPage {...props} lastCleanupResult={result} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('3');
  });

  it('shows execution failure in the front confirmation and allows retry', async () => {
    const user = userEvent.setup();
    const onRunStorageCleanup = vi.fn().mockRejectedValueOnce(new Error('cleanup failed')).mockResolvedValue(result);
    render(<SettingsPage {...createProps({ onEstimateStorageCleanup: vi.fn(async () => estimate), onRunStorageCleanup })} />);
    const dialog = await confirmCleanup(user);
    const execute = within(dialog).getByRole('button', { name: i18n.t('settings.storage.cleanup_confirm.action.execute') });
    await user.click(execute);
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect((execute as HTMLButtonElement).disabled).toBe(false);
    await user.click(execute);
    expect(onRunStorageCleanup).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('preserves auto-delete off, save guards, bounds, and save failure', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const props = createProps({ autoDeleteEnabled: false, onAutoDeleteConfigChange: vi.fn(() => pending.promise) });
    render(<SettingsPage {...props} />);
    const input = screen.getByRole('spinbutton');
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(input.getAttribute('min')).toBe('1');
    expect(input.getAttribute('max')).toBe('3650');
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(props.onAutoDeleteConfigChange).toHaveBeenCalledWith(true, 30);
    expect((toggle as HTMLInputElement).disabled).toBe(true);
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: i18n.t('settings.storage.help.title') }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.reject(new Error('save failed')));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect((input as HTMLInputElement).disabled).toBe(false);
    await user.clear(input);
    expect(props.onAutoDeleteConfigChange).toHaveBeenLastCalledWith(true, 1);
  });

  it.each([['0', 1], ['4000', 3650]])('keeps the auto-delete day bounds for %s', async (value, expected) => {
    const props = createProps();
    render(<SettingsPage {...props} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
    await waitFor(() => expect(props.onAutoDeleteConfigChange).toHaveBeenCalledWith(true, expected));
  });

  it('cancels both reset steps without deletion and clears a previous token', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<SettingsPage {...props} />);
    await user.click(screen.getByTestId('settings-reset-open-button'));
    await user.click(within(screen.getByTestId('settings-reset-guide-dialog')).getByRole('button', { name: i18n.t('common.cancel') }));
    await openResetFinal(user);
    await user.type(screen.getByTestId('settings-reset-confirm-input'), i18n.t('settings.danger.reset_confirm_token'));
    await user.click(within(screen.getByTestId('settings-reset-final-dialog')).getByRole('button', { name: i18n.t('common.cancel') }));
    await openResetFinal(user);
    expect((screen.getByTestId('settings-reset-confirm-input') as HTMLInputElement).value).toBe('');
    expect(props.onResetLocalData).not.toHaveBeenCalled();
  });

  it('keeps reset processing visible, blocks duplicate/escape, and reports failure', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const props = createProps({ onResetLocalData: vi.fn(() => pending.promise) });
    render(<SettingsPage {...props} />);
    const dialog = await openResetFinal(user);
    await user.type(screen.getByTestId('settings-reset-confirm-input'), i18n.t('settings.danger.reset_confirm_token'));
    await user.dblClick(screen.getByTestId('settings-reset-execute-button'));
    expect(props.onResetLocalData).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole('status').textContent).toBe(i18n.t('settings.danger.running'));
    expect((screen.getByTestId('settings-reset-confirm-input') as HTMLInputElement).disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('settings-reset-final-dialog')).toBeTruthy();
    await act(async () => pending.reject(new Error('reset failed')));
    expect(within(dialog).getByRole('alert')).toBeTruthy();
    expect((screen.getByTestId('settings-reset-execute-button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps reset unavailable while the app is busy', async () => {
    const user = userEvent.setup();
    const props = createProps();
    const view = render(<SettingsPage {...props} busy />);
    expect((screen.getByTestId('settings-reset-open-button') as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<SettingsPage {...props} />);
    await openResetFinal(user);
    await user.type(screen.getByTestId('settings-reset-confirm-input'), i18n.t('settings.danger.reset_confirm_token'));
    view.rerender(<SettingsPage {...props} busy />);
    expect((screen.getByTestId('settings-reset-execute-button') as HTMLButtonElement).disabled).toBe(true);
    screen.getByTestId('settings-reset-execute-button').click();
    expect(props.onResetLocalData).not.toHaveBeenCalled();
  });
  it('hides health summary in normal state and does not treat check-not-run as health warning', () => {
    render(<SettingsPage {...createProps()} />);

    expect(screen.queryByTestId('settings-health-summary-card')).toBeNull();
    expect(screen.getByTestId('settings-song-status-chip').getAttribute('data-song-status')).toBe('check_not_run');
  });

  it('toggles debug mode after tapping app version 7 times', async () => {
    const user = userEvent.setup();
    const onToggleDebugMode = vi.fn();
    render(<SettingsPage {...createProps({ onToggleDebugMode })} />);

    const versionTrigger = screen.getByTestId('settings-app-version-trigger-button');
    for (let i = 0; i < 6; i += 1) {
      await user.click(versionTrigger);
    }
    expect(onToggleDebugMode).toHaveBeenCalledTimes(0);

    await user.click(versionTrigger);
    expect(onToggleDebugMode).toHaveBeenCalledTimes(1);
  });

  it('shows technical info only in debug mode', () => {
    const { rerender } = render(<SettingsPage {...createProps({ debugModeEnabled: false })} />);
    expect(screen.queryByTestId('settings-technical-card')).toBeNull();

    rerender(<SettingsPage {...createProps({ debugModeEnabled: true })} />);
    expect(screen.getByTestId('settings-technical-card')).toBeTruthy();
  });

  it('isolates local reset behind two-step confirmation and confirmation text', async () => {
    const user = userEvent.setup();
    const onResetLocalData = vi.fn(async () => undefined);
    render(<SettingsPage {...createProps({ onResetLocalData })} />);

    await user.click(screen.getByTestId('settings-reset-open-button'));
    expect(screen.getByTestId('settings-reset-guide-dialog')).toBeTruthy();

    await user.click(screen.getByTestId('settings-reset-guide-next-button'));
    const executeButton = screen.getByTestId('settings-reset-execute-button');
    const confirmInput = screen.getByTestId('settings-reset-confirm-input');
    expect((executeButton as HTMLButtonElement).disabled).toBe(true);

    await user.type(confirmInput, 'not-confirm-token');
    expect((executeButton as HTMLButtonElement).disabled).toBe(true);

    const resetConfirmToken = i18n.t('settings.danger.reset_confirm_token');
    await user.clear(confirmInput);
    await user.type(confirmInput, resetConfirmToken);
    expect((executeButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(executeButton);
    expect(onResetLocalData).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('settings-reset-final-dialog')).toBeNull());
  });
});
