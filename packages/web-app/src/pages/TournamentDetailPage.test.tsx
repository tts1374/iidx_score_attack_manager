import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TournamentDetailItem } from '@iidx/db';

import { TournamentDetailPage } from './TournamentDetailPage';

vi.mock('../services/context', () => ({
  useAppServices: () => ({
    appDb: {
      getEvidenceRecord: vi.fn(),
      getEvidenceRelativePath: vi.fn(),
      markEvidenceSendCompleted: vi.fn(),
    },
    opfs: {
      readFile: vi.fn(),
    },
  }),
}));

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: vi.fn(() => null),
  });
});

afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: originalCanvasGetContext,
  });
  cleanup();
});

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
  submittedCount: 1,
  sendWaitingCount: 1,
  pendingCount: 2,
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
      resolveIssue: 'CHART_NOT_FOUND' as const,
      submitted: false,
      updateSeq: 0,
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

describe('TournamentDetailPage', () => {
  it('shows active tournament actions and hashtag-only send message', async () => {
    render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    expect(screen.getByTestId('tournament-detail-share-button')).toBeTruthy();
    const submitButton = screen.getByTestId('tournament-detail-submit-open-button') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
    expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('1');
    expect(screen.getAllByTestId('tournament-detail-chart-submit-button').length).toBeGreaterThan(0);
    const submittedLabels = screen
      .getAllByTestId('tournament-detail-chart-status-label')
      .filter((element) => element.getAttribute('data-chart-status') === 'submitted');
    expect(submittedLabels.length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('tournament-detail-chart-send-pending-badge').length).toBe(1);

    await userEvent.click(submitButton);
    const submitMessageInput = screen.getByTestId('tournament-detail-submit-message-input') as HTMLInputElement;
    expect(submitMessageInput.value).toBe('#SCOREATTACK ');
    expect(screen.getByTestId('tournament-detail-mark-send-completed-button')).toBeTruthy();
  });

  it('normalizes japanese hashtag for submit message', async () => {
    render(
      <TournamentDetailPage
        detail={buildDetail({ hashtag: '  ＃スコア タ  ' })}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    await userEvent.click(screen.getByTestId('tournament-detail-submit-open-button'));
    const submitMessageInput = screen.getByTestId('tournament-detail-submit-message-input') as HTMLInputElement;
    expect(submitMessageInput.value).toBe('#スコアタ ');
  });

  it('clears send pending only after explicit completion action', async () => {
    render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('1');

    await userEvent.click(screen.getByTestId('tournament-detail-submit-open-button'));
    await userEvent.click(screen.getByTestId('tournament-detail-mark-send-completed-button'));

    expect(await screen.findByTestId('tournament-detail-submit-notice-alert')).toBeTruthy();
    expect(screen.getByTestId('tournament-detail-submit-summary-text').getAttribute('data-send-pending-count')).toBe('0');
    expect(screen.queryByTestId('tournament-detail-chart-send-pending-badge')).toBeNull();
    const completeButton = screen.getByTestId('tournament-detail-mark-send-completed-button') as HTMLButtonElement;
    expect(completeButton.disabled).toBe(true);
  });

  it('separates share modal content and debug info visibility', async () => {
    render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={true}
        debugLastError="sample error"
        onReportDebugError={() => undefined}
      />,
    );

    const shareButtons = screen.getAllByTestId('tournament-detail-share-button');
    expect(shareButtons.length).toBeGreaterThan(0);
    await userEvent.click(shareButtons[0]!);
    expect(screen.getByTestId('tournament-detail-share-dialog')).toBeTruthy();
    expect(screen.getByTestId('tournament-detail-share-definition-alert')).toBeTruthy();
    expect(await screen.findByTestId('tournament-detail-share-debug-accordion')).toBeTruthy();
  });

  it('hides share button for imported tournaments', () => {
    render(
      <TournamentDetailPage
        detail={buildDetail({ isImported: true })}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    expect(screen.queryByTestId('tournament-detail-share-button')).toBeNull();
  });

  it('hides chart register buttons and disables send bar outside active period', () => {
    const { rerender } = render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-01-31"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    const upcomingSubmitButton = screen.getByTestId('tournament-detail-submit-open-button') as HTMLButtonElement;
    expect(upcomingSubmitButton.disabled).toBe(true);
    expect(screen.queryByTestId('tournament-detail-chart-submit-button')).toBeNull();

    rerender(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-13"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    const endedSubmitButton = screen.getByTestId('tournament-detail-submit-open-button') as HTMLButtonElement;
    expect(endedSubmitButton.disabled).toBe(true);
    expect(screen.queryByTestId('tournament-detail-chart-submit-button')).toBeNull();
  });

  it('disables send bar when all charts are unregistered', () => {
    render(
      <TournamentDetailPage
        detail={buildDetail({
          submittedCount: 0,
          pendingCount: detail.chartCount,
          lastSubmittedAt: null,
          charts: detail.charts.map((chart) => ({
            ...chart,
            submitted: false,
            updateSeq: 0,
            fileDeleted: false,
          })),
        })}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onUpdated={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    const submitButton = screen.getByTestId('tournament-detail-submit-open-button') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });
});
