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
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: '大会を共有' })).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: '送信する' }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
    expect(screen.getByText('送信待ち 1件')).toBeTruthy();
    expect(screen.getByRole('button', { name: '差し替え' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '登録' }).length).toBeGreaterThan(0);
    expect(screen.getByText('登録済')).toBeTruthy();
    expect(screen.getAllByText('未登録').length).toBeGreaterThan(0);
    expect(screen.getByText('送信待ち')).toBeTruthy();
    expect(screen.queryByText('提出する')).toBeNull();
    expect(screen.queryByText('提出済')).toBeNull();
    expect(screen.queryByText('未提出')).toBeNull();

    await userEvent.click(submitButton);
    const submitMessageInput = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    expect(submitMessageInput.value).toBe('#SCOREATTACK ');
    expect(screen.getByRole('button', { name: '送信完了にする' })).toBeTruthy();
  });

  it('clears send pending only after explicit completion action', async () => {
    render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    expect(screen.getByText('送信待ち 1件')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '送信する' }));
    await userEvent.click(screen.getByRole('button', { name: '送信完了にする' }));

    expect(await screen.findByText('1件を送信完了にしました。')).toBeTruthy();
    expect(screen.getByText('送信待ち 0件')).toBeTruthy();
    expect(screen.queryByText('送信待ち', { selector: '.chartSendPendingBadge' })).toBeNull();
    const completeButton = screen.getByRole('button', { name: '送信完了にする' }) as HTMLButtonElement;
    expect(completeButton.disabled).toBe(true);
  });

  it('separates share modal content and debug info visibility', async () => {
    render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={true}
        debugLastError="sample error"
        onReportDebugError={() => undefined}
      />,
    );

    const shareButtons = screen.getAllByRole('button', { name: '大会を共有' });
    expect(shareButtons.length).toBeGreaterThan(0);
    await userEvent.click(shareButtons[0]!);
    expect(screen.getByText('共有されるのは大会定義のみ（画像は含まれません）')).toBeTruthy();
    expect(await screen.findByText('技術情報')).toBeTruthy();
  });

  it('hides share button for imported tournaments', () => {
    render(
      <TournamentDetailPage
        detail={buildDetail({ isImported: true })}
        todayDate="2026-02-10"
        onOpenSubmit={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '大会を共有' })).toBeNull();
  });

  it('hides chart register buttons and disables send bar outside active period', () => {
    const { rerender } = render(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-01-31"
        onOpenSubmit={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    const upcomingSubmitButton = screen.getByRole('button', { name: '送信する' }) as HTMLButtonElement;
    expect(upcomingSubmitButton.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '差し替え' })).toBeNull();
    expect(screen.queryByRole('button', { name: '登録' })).toBeNull();

    rerender(
      <TournamentDetailPage
        detail={buildDetail()}
        todayDate="2026-02-13"
        onOpenSubmit={() => undefined}
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    const endedSubmitButton = screen.getByRole('button', { name: '送信する' }) as HTMLButtonElement;
    expect(endedSubmitButton.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '差し替え' })).toBeNull();
    expect(screen.queryByRole('button', { name: '登録' })).toBeNull();
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
        onOpenSettings={() => undefined}
        debugModeEnabled={false}
        debugLastError={null}
        onReportDebugError={() => undefined}
      />,
    );

    const submitButton = screen.getByRole('button', { name: '送信する' }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });
});
