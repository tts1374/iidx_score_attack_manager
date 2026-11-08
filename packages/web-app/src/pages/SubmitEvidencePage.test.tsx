import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TournamentDetailChart, TournamentDetailItem } from '@iidx/db';

import { SubmitEvidencePage } from './SubmitEvidencePage';

const mocks = vi.hoisted(() => ({
  appDb: {
    getEvidenceRecord: vi.fn(), getEvidenceRelativePath: vi.fn(), upsertEvidenceMetadata: vi.fn(),
  },
  opfs: { readFile: vi.fn(), writeFileAtomic: vi.fn() },
  reencode: vi.fn(),
}));
vi.mock('../services/context', () => ({ useAppServices: () => mocks }));
vi.mock('../utils/image', () => ({
  reencodeImageToJpeg: mocks.reencode,
  toSafeArrayBuffer: (bytes: Uint8Array) => bytes.buffer,
}));

const chart: TournamentDetailChart = {
  chartId: 100, title: 'AA', playStyle: 'SP', difficulty: 'ANOTHER', level: '12',
  resolveIssue: null, submitted: false, updateSeq: 0, needsSend: false, fileDeleted: false,
};
const detail = { tournamentUuid: '11111111-1111-4111-8111-111111111111' } as TournamentDetailItem;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function renderPage(overrides: Partial<TournamentDetailChart> = {}, onSaved = vi.fn()) {
  render(<SubmitEvidencePage detail={detail} chart={{ ...chart, ...overrides }} onSaved={onSaved} />);
  return onSaved;
}
function selectImage() {
  fireEvent.change(document.querySelector('input[type="file"]:not([capture])')!, {
    target: { files: [new File(['image'], 'score.jpg', { type: 'image/jpeg' })] },
  });
}

describe('SubmitEvidencePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    URL.createObjectURL = vi.fn(() => 'blob:score');
    URL.revokeObjectURL = vi.fn();
    mocks.appDb.getEvidenceRecord.mockResolvedValue(null);
    mocks.appDb.getEvidenceRelativePath.mockResolvedValue('evidence/100.jpg');
    mocks.opfs.writeFileAtomic.mockResolvedValue(undefined);
    mocks.appDb.upsertEvidenceMetadata.mockResolvedValue(undefined);
    mocks.reencode.mockResolvedValue({ bytes: new Uint8Array([1, 2]), blob: new Blob(['image']), width: 10, height: 10 });
  });
  afterEach(() => {
    cleanup();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it.each([
    [{}, 'unregistered'],
    [{ updateSeq: 1, needsSend: true }, 'unshared'],
    [{ updateSeq: 1, needsSend: false }, 'shared'],
    [{ updateSeq: 1, fileDeleted: true }, 'unregistered'],
  ] as Array<[Partial<TournamentDetailChart>, string]>)('preserves the registration state for %j', (overrides, state) => {
    renderPage(overrides);
    const badge = screen.queryByTestId('submit-evidence-header-state-badge');
    if (state === 'shared') expect(badge).toBeNull();
    else expect(badge?.getAttribute('data-chart-state')).toBe(state);
    expect(screen.getByText('この端末に保存')).toBeTruthy();
    expect(screen.getByRole('button', { name: '画像を選んで保存' })).toBeTruthy();
    if (overrides.updateSeq && !overrides.fileDeleted) expect(screen.getByText(/保存済みの画像を置き換え/)).toBeTruthy();
    else expect(screen.queryByText(/保存済みの画像を置き換え/)).toBeNull();
  });

  it.each([false, true])('saves the selected image and returns the correct saved/replaced signal (%s)', async (replace) => {
    const onSaved = renderPage(replace ? { updateSeq: 1, needsSend: false } : {});
    selectImage();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(replace ? 'replaced' : 'saved'));
    expect(mocks.opfs.writeFileAtomic).toHaveBeenCalledTimes(1);
    expect(mocks.appDb.upsertEvidenceMetadata).toHaveBeenCalledWith(expect.objectContaining({ chartId: 100, width: 10, height: 10 }));
    expect(screen.getByAltText('端末に登録したスコア画像')).toBeTruthy();
    expect(screen.getByTestId('submit-evidence-header-state-badge').getAttribute('data-chart-state')).toBe('unshared');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens optional submission guidance from the help icon and returns focus on close', async () => {
    renderPage();
    expect(screen.queryByText(/登録した画像は/)).toBeNull();
    const help = screen.getByRole('button', { name: '画像登録の説明' });
    await userEvent.click(help);
    const dialog = screen.getByRole('dialog', { name: '画像登録の説明' });
    expect(within(dialog).getByText('登録した画像は、大会詳細の「スコアを提出」から共有します。')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(help);
    expect(mocks.reencode).not.toHaveBeenCalled();
  });

  it.each([
    [new DOMException('full', 'QuotaExceededError'), '端末の空き容量が不足しています'],
    [new Error('write failed'), '画像を保存できませんでした'],
  ])('explains save failure without reporting success (%s)', async (error, text) => {
    mocks.opfs.writeFileAtomic.mockRejectedValue(error);
    const onSaved = renderPage();
    selectImage();
    expect((await screen.findByRole('alert')).textContent).toContain(text);
    expect(onSaved).not.toHaveBeenCalled();
    expect(mocks.appDb.upsertEvidenceMetadata).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: '画像を選んで保存' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('submit-evidence-header-state-badge').getAttribute('data-chart-state')).toBe('unregistered');
  });

  it('disables inputs and duplicate selections while saving', async () => {
    let finish!: () => void;
    mocks.opfs.writeFileAtomic.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const onSaved = renderPage();
    selectImage();
    await screen.findByRole('status');
    expect((screen.getByRole('button', { name: '保存中' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '画像登録の説明' }) as HTMLButtonElement).disabled).toBe(true);
    document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach(input => expect(input.disabled).toBe(true));
    selectImage();
    expect(mocks.reencode).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.opfs.writeFileAtomic).toHaveBeenCalledTimes(1));
    finish();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
