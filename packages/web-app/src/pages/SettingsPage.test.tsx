import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';

import { SettingsPage } from './SettingsPage';
import i18n from '../i18n';

type SettingsPageProps = ComponentProps<typeof SettingsPage>;

afterEach(() => {
  cleanup();
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

describe('SettingsPage', () => {
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
  });
});
