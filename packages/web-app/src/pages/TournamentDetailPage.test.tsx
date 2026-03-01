import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TournamentDetailItem } from '@iidx/db';

import { TournamentDetailPage } from './TournamentDetailPage';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  },
}));

const serviceMocks = vi.hoisted(() => ({
  appDb: {
    getEvidenceRecord: vi.fn(),
    getEvidenceRelativePath: vi.fn(),
    markEvidenceSendCompleted: vi.fn(),
    markEvidenceSendPending: vi.fn(),
  },
  opfs: {
    readFile: vi.fn(),
  },
}));

vi.mock('../services/context', () => ({
  useAppServices: () => serviceMocks,
}));

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
const originalCanvasToBlob = HTMLCanvasElement.prototype.toBlob;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalImage = window.Image;
const originalNavigatorClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');
const originalNavigatorShare = Object.getOwnPropertyDescriptor(window.navigator, 'share');
const originalNavigatorCanShare = Object.getOwnPropertyDescriptor(window.navigator, 'canShare');
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

const detail: TournamentDetailItem = {
  tournamentUuid: '11111111-1111-4111-8111-111111111111',
  sourceTournamentUuid: '22222222-2222-4222-8222-222222222222',
  defHash: 'def_hash_001',
  tournamentName: 'テスト大会',
  owner: 'owner',
  hashtag: 'SCOREATTACK',
  startDate: '2026-02-01',
  endDate: '2026-02-12',
  isImported: false,
  chartCount: 3,
  submittedCount: 2,
  sendWaitingCount: 1,
  pendingCount: 1,
  lastSubmittedAt: '2026-02-10T12:00:00.000Z',
  charts: [
    {
      chartId: 100,
      title: 'Song A',
      playStyle: 'SP',
      difficulty: 'ANOTHER',
      level: '12',
      resolveIssue: null,
      submitted: false,
      updateSeq: 0,
      needsSend: false,
      fileDeleted: false,
    },
    {
      chartId: 101,
      title: 'Song B',
      playStyle: 'SP',
      difficulty: 'HYPER',
      level: '10',
      resolveIssue: null,
      submitted: true,
      updateSeq: 2,
      needsSend: true,
      fileDeleted: false,
    },
    {
      chartId: 102,
      title: 'Song C',
      playStyle: 'DP',
      difficulty: 'NORMAL',
      level: '8',
      resolveIssue: null,
      submitted: true,
      updateSeq: 1,
      needsSend: false,
      fileDeleted: false,
    },
  ],
};

function buildDetail(overrides: Partial<TournamentDetailItem> = {}): TournamentDetailItem {
  return {
    ...detail,
    ...overrides,
    charts: overrides.charts ?? detail.charts,
  };
}

function renderPage(
  overrides: Partial<TournamentDetailItem> = {},
  todayDate = '2026-02-10',
  options: { debugModeEnabled?: boolean } = {},
): void {
  render(
    <TournamentDetailPage
      detail={buildDetail(overrides)}
      todayDate={todayDate}
      onOpenSubmit={() => undefined}
      onUpdated={() => undefined}
      onOpenSettings={() => undefined}
      debugModeEnabled={options.debugModeEnabled ?? false}
      debugLastError={null}
      onReportDebugError={() => undefined}
    />,
  );
}

function mockWebShareAvailable(): { share: ReturnType<typeof vi.fn>; canShare: ReturnType<typeof vi.fn> } {
  const share = vi.fn().mockResolvedValue(undefined);
  const canShare = vi.fn().mockReturnValue(true);
  Object.defineProperty(window.navigator, 'share', {
    configurable: true,
    value: share,
  });
  Object.defineProperty(window.navigator, 'canShare', {
    configurable: true,
    value: canShare,
  });
  return { share, canShare };
}

function mockMatchMedia(maxWidth599Matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width:599px') ? maxWidth599Matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function mockShareImageReady(): void {
  const gradient = {
    addColorStop: vi.fn(),
  } as unknown as CanvasGradient;
  const contextState: Record<string, unknown> = {
    createLinearGradient: vi.fn(() => gradient),
    measureText: vi.fn((text: string) => ({ width: text.length * 11 } as TextMetrics)),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    textBaseline: 'alphabetic',
    textAlign: 'left',
    font: '',
    fillStyle: '#000000',
    imageSmoothingEnabled: true,
  };
  const context = new Proxy(
    contextState,
    {
      get(target, prop) {
        if (prop in target) {
          return target[prop as string];
        }
        return vi.fn();
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: vi.fn(() => context),
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    writable: true,
    value: (callback: BlobCallback): void => {
      callback(new Blob(['png'], { type: 'image/png' }));
    },
  });

  class MockImage {
    onload: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null;

    onerror: OnErrorEventHandler = null;

    set src(_: string) {
      queueMicrotask(() => {
        if (this.onload) {
          this.onload.call(this as unknown as GlobalEventHandlers, new Event('load'));
        }
      });
    }
  }

  Object.defineProperty(window, 'Image', {
    configurable: true,
    writable: true,
    value: MockImage,
  });
}

describe('TournamentDetailPage', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: vi.fn(() => null),
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, 'canShare', {
      configurable: true,
      value: undefined,
    });

    vi.clearAllMocks();
    serviceMocks.appDb.getEvidenceRecord.mockResolvedValue({ fileDeleted: false });
    serviceMocks.appDb.getEvidenceRelativePath.mockResolvedValue('evidences/mock/1.jpg');
    serviceMocks.appDb.markEvidenceSendCompleted.mockResolvedValue(undefined);
    serviceMocks.appDb.markEvidenceSendPending.mockResolvedValue(undefined);
    serviceMocks.opfs.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: originalCanvasGetContext,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      writable: true,
      value: originalCanvasToBlob,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectUrl,
    });
    Object.defineProperty(window, 'Image', {
      configurable: true,
      writable: true,
      value: originalImage,
    });
    if (originalNavigatorClipboard) {
      Object.defineProperty(window.navigator, 'clipboard', originalNavigatorClipboard);
    }
    if (originalNavigatorShare) {
      Object.defineProperty(window.navigator, 'share', originalNavigatorShare);
    }
    if (originalNavigatorCanShare) {
      Object.defineProperty(window.navigator, 'canShare', originalNavigatorCanShare);
    }
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    } else {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: undefined,
      });
    }
    vi.restoreAllMocks();
  });

  it('shows at most one state badge per chart and hides shared status badge', () => {
    renderPage();

    const statusLabels = screen.getAllByTestId('tournament-detail-chart-status-label');
    expect(statusLabels).toHaveLength(2);
    expect(statusLabels.map((node) => node.getAttribute('data-chart-state'))).toEqual(['unregistered', 'unshared']);
    const actionAreas = document.querySelectorAll('.chartActions-detail');
    actionAreas.forEach((area) => {
      expect(within(area as HTMLElement).queryByTestId('tournament-detail-chart-status-label')).toBeNull();
    });
    expect(document.querySelectorAll('.chartLeftStatusRow')).toHaveLength(3);
    expect(document.querySelectorAll('.chartActionSlot')).toHaveLength(3);
    expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('1');
    expect(screen.getByTestId('tournament-summary-relative-detail').textContent).toBe('残り2日');
    expect(screen.getByTestId('tournament-summary-incomplete-unregistered-detail').textContent).toContain('1');
    expect(screen.getByTestId('tournament-summary-incomplete-unshared-detail').textContent).toContain('1');
  });

  it('uses one-column mobile layout and places actions in the status row', () => {
    mockMatchMedia(true);
    renderPage();

    expect(document.querySelectorAll('.chartActions-detail')).toHaveLength(0);
    expect(document.querySelectorAll('.chartLeftStatusRow-mobile')).toHaveLength(3);
    expect(document.querySelectorAll('.chartInlineActionSlot')).toHaveLength(3);
  });

  it('emphasizes register only for unregistered chart and keeps replace as secondary', () => {
    renderPage();

    const actionButtons = screen.getAllByTestId('tournament-detail-chart-submit-button') as HTMLButtonElement[];
    expect(actionButtons).toHaveLength(3);

    expect(actionButtons[0]?.textContent).toContain('登録する');
    expect(actionButtons[0]?.getAttribute('data-chart-action-tone')).toBe('primary');
    expect(actionButtons[0]?.className).toContain('chartSubmitButton-primary');

    expect(actionButtons[1]?.textContent).toContain('差し替え');
    expect(actionButtons[1]?.getAttribute('data-chart-action-tone')).toBe('secondary');
    expect(actionButtons[1]?.className).toContain('chartSubmitButton-secondary');

    expect(actionButtons[2]?.textContent).toContain('差し替え');
    expect(actionButtons[2]?.getAttribute('data-chart-action-tone')).toBe('secondary');
    expect(actionButtons[2]?.className).toContain('chartSubmitButton-secondary');
  });

  it('renders chart attributes as one line text and removes attribute badges', () => {
    renderPage();

    const metaLines = screen.getAllByTestId('tournament-detail-chart-meta-line');
    expect(metaLines).toHaveLength(3);
    expect(metaLines[0]?.textContent).toMatch(/SP\s*ANOTHER 12/);
    expect(metaLines[1]?.textContent).toMatch(/SP\s*HYPER 10/);
    expect(metaLines[2]?.textContent).toMatch(/DP\s*NORMAL 8/);
    expect(metaLines[0]?.textContent).not.toContain('・');
    expect(metaLines[0]?.textContent).not.toContain('Lv');
    expect(document.querySelector('.chartDifficultyTag')).toBeNull();
    expect(document.querySelector('.chartLevelTag')).toBeNull();
  });

  it('does not render tournament id or technical details in summary card', () => {
    renderPage({}, '2026-02-10', { debugModeEnabled: true });

    expect(screen.queryByText(new RegExp(detail.tournamentUuid.slice(0, 10)))).toBeNull();
    expect(screen.queryByText('詳細情報')).toBeNull();
    expect(screen.queryByText(`def_hash: ${detail.defHash}`)).toBeNull();
  });

  it('enables the footer share CTA outside active period when unshared charts exist', () => {
    renderPage({}, '2026-02-13');

    const footerShareButton = screen.getByTestId('tournament-detail-submit-open-button') as HTMLButtonElement;
    expect(footerShareButton.disabled).toBe(false);
  });

  it('shows resubmit CTA when unshared count is zero but local-saved charts exist', () => {
    renderPage({
      charts: detail.charts.map((chart) => ({
        ...chart,
        needsSend: false,
      })),
    });

    const footerShareButton = screen.getByTestId('tournament-detail-submit-open-button') as HTMLButtonElement;
    expect(footerShareButton.disabled).toBe(false);
    expect(footerShareButton.textContent).toContain('再提出');
  });

  it('hides the footer submit CTA when no local-saved charts exist', () => {
    renderPage({
      charts: detail.charts.map((chart) => ({
        ...chart,
        submitted: false,
        updateSeq: 0,
        needsSend: false,
        fileDeleted: false,
      })),
    });

    expect(screen.queryByTestId('tournament-detail-submit-open-button')).toBeNull();
  });

  it('opens submit share confirm dialog with cancel and one submit action', async () => {
    renderPage();

    const footerShareButton = screen.getByTestId('tournament-detail-submit-open-button');
    expect(footerShareButton.textContent).toContain('提出する');

    await userEvent.click(screen.getByTestId('tournament-detail-submit-open-button'));
    const dialog = screen.getByTestId('tournament-detail-submit-dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId('tournament-detail-submit-confirm-text').textContent).toContain('保存済みの未提出譜面を提出します');
    const dialogScope = within(dialog);
    expect(dialogScope.getByRole('button', { name: 'キャンセル' })).toBeTruthy();
    expect(dialogScope.getByTestId('tournament-detail-submit-share-button')).toBeTruthy();
    expect(screen.queryByTestId('tournament-detail-submit-message-input')).toBeNull();
    expect(screen.queryByTestId('tournament-detail-mark-send-completed-button')).toBeNull();
  });

  it('shows overwrite notice in resubmit mode', async () => {
    renderPage({
      charts: detail.charts.map((chart) => ({
        ...chart,
        needsSend: false,
      })),
    });

    const footerShareButton = screen.getByTestId('tournament-detail-submit-open-button');
    expect(footerShareButton.textContent).toContain('再提出');

    await userEvent.click(footerShareButton);
    expect(screen.getByTestId('tournament-detail-submit-confirm-text').textContent).toContain('再提出します');
    expect(screen.getByTestId('tournament-detail-submit-resubmit-note').textContent).toContain('上書き');
  });

  it('marks as shared only on success and allows undo for the latest operation', async () => {
    const { share } = mockWebShareAvailable();
    renderPage();

    await userEvent.click(screen.getByTestId('tournament-detail-submit-open-button'));
    await userEvent.click(screen.getByTestId('tournament-detail-submit-share-button'));

    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(1);
      expect(serviceMocks.appDb.markEvidenceSendCompleted).toHaveBeenCalledWith(detail.tournamentUuid, [101]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('0');
    });

    const undoButton = await screen.findByTestId('tournament-detail-submit-undo-button');
    await userEvent.click(undoButton);

    await waitFor(() => {
      expect(serviceMocks.appDb.markEvidenceSendPending).toHaveBeenCalledWith(detail.tournamentUuid, [101]);
    });
    expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('1');
  });

  it('does not mark as shared when fallback copy fails', async () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('copy failed')),
      },
    });
    renderPage();

    await userEvent.click(screen.getByTestId('tournament-detail-submit-open-button'));
    await userEvent.click(screen.getByTestId('tournament-detail-submit-share-button'));

    await waitFor(() => {
      expect(serviceMocks.appDb.markEvidenceSendCompleted).not.toHaveBeenCalled();
    });
    expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('1');
  });

  it('simplifies share dialog and keeps only required controls', async () => {
    mockShareImageReady();
    renderPage();

    await userEvent.click(screen.getByTestId('tournament-detail-share-button'));
    const dialog = screen.getByTestId('tournament-detail-share-dialog');
    const dialogScope = within(dialog);

    expect(dialogScope.queryByTestId('tournament-detail-share-definition-alert')).toBeNull();
    expect(dialogScope.queryByText('生成画像（1080x1920）')).toBeNull();
    expect(dialogScope.getByRole('button', { name: '投稿文をコピー' })).toBeTruthy();
    expect(dialogScope.getAllByText('共有')).toHaveLength(1);
  });

  it('copies post template text including hashtag and import URL', async () => {
    mockShareImageReady();
    renderPage();

    await userEvent.click(screen.getByTestId('tournament-detail-share-button'));
    const copyButton = await screen.findByRole('button', { name: '投稿文をコピー' });
    await waitFor(() => {
      expect((copyButton as HTMLButtonElement).disabled).toBe(false);
    });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });
    const copiedText = (window.navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(copiedText).toContain('スコアタ開催します！ #SCOREATTACK');
    expect(copiedText).toContain('/import/confirm?p=');
    expect(copiedText).toContain('\n');
  });
});
