import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportTargetTournament } from '@iidx/db';
import type { TournamentPayload } from '@iidx/shared';

import { ImportConfirmPage } from './ImportConfirmPage';
import i18n, { ensureI18n } from '../i18n';
import { resolveImportPayloadFromLocation } from '../utils/import-confirm';

const appDb = vi.hoisted(() => ({
  hasSongMaster: vi.fn(),
  listSongMasterChartsByIds: vi.fn(),
  findImportTargetTournament: vi.fn(),
}));
vi.mock('../services/context', () => ({ useAppServices: () => ({ appDb }) }));
vi.mock('../utils/import-confirm', () => ({ resolveImportPayloadFromLocation: vi.fn() }));

const payload: TournamentPayload = {
  v: 1,
  uuid: '00000000-0000-4000-8000-000000000089',
  name: 'Shared name',
  owner: 'Organizer',
  hashtag: 'scoreattack',
  start: '2026-11-01',
  end: '2026-11-30',
  charts: [1001, 1002],
};
const existing: ImportTargetTournament = {
  tournamentUuid: payload.uuid,
  sourceTournamentUuid: null,
  tournamentName: 'Saved name',
  owner: 'Saved organizer',
  hashtag: 'saved',
  startDate: payload.start,
  endDate: payload.end,
  chartIds: [1001, 1003],
};

function mount(busy = false) {
  const props = {
    todayDate: '2026-11-08', busy,
    onBack: vi.fn(), onOpenSettings: vi.fn(), onConfirmImport: vi.fn().mockResolvedValue(undefined),
  };
  const rendered = render(<ImportConfirmPage {...props} />);
  return { ...rendered, ...props };
}

function importButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: i18n.t('import.action.import') });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveImportPayloadFromLocation).mockReturnValue({ status: 'ready', rawPayloadParam: 'test', payload });
  appDb.hasSongMaster.mockResolvedValue(true);
  appDb.listSongMasterChartsByIds.mockResolvedValue(payload.charts.map((chartId) => ({
    chartId, title: `Song ${chartId}`, playStyle: 'SP', difficulty: 'ANOTHER', level: '12',
  })));
  appDb.findImportTargetTournament.mockResolvedValue(null);
});
afterEach(cleanup);

describe.each(['ja', 'en', 'ko'] as const)('ImportConfirmPage (%s)', (language) => {
  beforeEach(async () => { await ensureI18n(language); });

  it('describes a new import without an existing-update warning and submits the original payload', async () => {
    const { onConfirmImport } = mount();
    await screen.findByText(i18n.t('import.confirm.summary.create_new'));
    expect(screen.queryByText(i18n.t('import.confirm.caution.update_existing'))).toBeNull();
    expect(screen.queryByText(i18n.t('import.confirm.merge.note'))).toBeNull();
    expect(importButton().disabled).toBe(false);
    await userEvent.click(importButton());
    expect(onConfirmImport).toHaveBeenCalledOnce();
    expect(onConfirmImport).toHaveBeenCalledWith(payload);
  });

  it.each([[[1001, 1003], 1], [[1001, 1002, 1003], 0]] as const)(
    'counts only missing charts for existing charts %s', async (chartIds, count) => {
      appDb.findImportTargetTournament.mockResolvedValue({ ...existing, chartIds: [...chartIds] });
      const { onConfirmImport } = mount();
      const summary = count > 0
        ? i18n.t('import.confirm.summary.update_existing', { count })
        : i18n.t('import.confirm.summary.unchanged');
      await screen.findByText(summary);
      expect(screen.getByText(i18n.t('import.confirm.summary.target', { name: existing.tournamentName }))).toBeTruthy();
      expect(screen.getByText(i18n.t('import.confirm.merge.note'))).toBeTruthy();
      expect(screen.queryByText(i18n.t('import.confirm.summary.create_new'))).toBeNull();
      await userEvent.click(importButton());
      expect(onConfirmImport).toHaveBeenCalledOnce();
      expect(onConfirmImport).toHaveBeenCalledWith(payload);
    },
  );

  it('keeps import disabled while validating and allows cancellation', async () => {
    appDb.hasSongMaster.mockReturnValue(new Promise(() => undefined));
    const { onBack } = mount();
    expect(screen.getByRole('status').textContent).toContain(i18n.t('import.state.wait'));
    expect(importButton().disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: i18n.t('common.cancel') }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each(['period', 'master', 'chart', 'link', 'expired', 'unexpected'])(
    'blocks %s errors, presents a remedy, and confines diagnostics to collapsed details', async (scenario) => {
      if (scenario === 'period') appDb.findImportTargetTournament.mockResolvedValue({ ...existing, endDate: '2026-12-01' });
      if (scenario === 'master') appDb.hasSongMaster.mockResolvedValue(false);
      if (scenario === 'chart') appDb.listSongMasterChartsByIds.mockResolvedValue([]);
      if (scenario === 'unexpected') appDb.hasSongMaster.mockRejectedValue(new Error('internal diagnostic'));
      if (scenario === 'expired') vi.mocked(resolveImportPayloadFromLocation).mockReturnValue({ status: 'ready', rawPayloadParam: 'test', payload: { ...payload, end: '2026-11-07' } });
      if (scenario === 'link') vi.mocked(resolveImportPayloadFromLocation).mockReturnValue({ status: 'invalid', error: { code: 'DECOMPRESS_ERROR', message: 'gzip' } });
      const { container, onOpenSettings, onConfirmImport, onBack } = mount();
      const dialog = await screen.findByRole('alertdialog', { name: i18n.t('import.confirm.error_title') });
      const alert = document.getElementById(dialog.getAttribute('aria-describedby')!)!;
      const disabledImport = container.querySelector<HTMLButtonElement>('.primaryActionButton')!;
      expect(disabledImport.disabled).toBe(true);
      await userEvent.click(disabledImport);
      expect(onConfirmImport).not.toHaveBeenCalled();
      const needsSettings = scenario === 'master' || scenario === 'chart';
      expect(alert.textContent).toContain(i18n.t(needsSettings ? 'import.remedy.song_data' : 'import.remedy.open_link'));
      expect(alert.textContent).not.toMatch(/UUID|gzip|payload|페이로드|ペイロード|1001|internal diagnostic/);
      expect(screen.queryByText(i18n.t('import.confirm.summary.create_new'))).toBeNull();
      expect(screen.queryByText(i18n.t('import.confirm.summary.update_existing', { count: 1 }))).toBeNull();
      const details = dialog.querySelector('details')!;
      expect(details.open).toBe(false);
      expect(details.querySelector('summary')?.textContent).toBe(i18n.t('import.confirm.technical_details'));
      if (scenario === 'chart') {
        expect(details.textContent).toContain('chart:1001');
        expect(container.querySelector('.chartList')?.textContent).not.toContain('1001');
      }
      if (scenario === 'unexpected') expect(details.textContent).toContain('internal diagnostic');
      await userEvent.click(details.querySelector('summary')!);
      expect(details.open).toBe(true);
      if (needsSettings) {
        await userEvent.click(screen.getByRole('button', { name: i18n.t('import.action.open_settings') }));
        expect(onOpenSettings).toHaveBeenCalledOnce();
      }
      await userEvent.click(screen.getByRole('button', { name: i18n.t('import.action.ok') }));
      expect(onBack).toHaveBeenCalledOnce();
    },
  );
});

it('returns through the same cancel callback when dismissing the error dialog with Escape', async () => {
  vi.mocked(resolveImportPayloadFromLocation).mockReturnValue({ status: 'invalid', error: { code: 'INVALID_PARAM', message: 'invalid' } });
  const { onBack } = mount();
  await screen.findByRole('alertdialog');
  await userEvent.keyboard('{Escape}');
  expect(onBack).toHaveBeenCalledOnce();
});

it('disables import while busy and prevents duplicate submissions while applying', async () => {
  await ensureI18n('ja');
  const { rerender } = mount(true);
  expect(importButton().disabled).toBe(true);
  const onConfirmImport = vi.fn(() => new Promise<void>(() => undefined));
  rerender(<ImportConfirmPage todayDate="2026-11-08" busy={false} onBack={vi.fn()} onOpenSettings={vi.fn()} onConfirmImport={onConfirmImport} />);
  await screen.findByText(i18n.t('import.confirm.summary.create_new'));
  await userEvent.click(importButton());
  const applyingButton = screen.getByRole('button', { name: i18n.t('import.action.importing') }) as HTMLButtonElement;
  expect(applyingButton.disabled).toBe(true);
  await userEvent.click(applyingButton);
  await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
});
