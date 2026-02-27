import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders active tournament card with remaining days', () => {
    render(
      <HomePage
        todayDate="2026-02-10"
        state="active"
        items={[
          {
            tournamentUuid: 't1',
            sourceTournamentUuid: null,
            tournamentName: 'テスト大会',
            owner: 'owner',
            hashtag: 'tag',
            startDate: '2026-02-01',
            endDate: '2026-02-12',
            isImported: false,
            chartCount: 4,
            submittedCount: 2,
            sendWaitingCount: 0,
            pendingCount: 2,
          },
        ]}
        onOpenDetail={() => undefined}
      />,
    );

    const firstCard = screen.getAllByRole('listitem')[0]!;
    expect(within(firstCard).getByText('開催中')).toBeTruthy();
    expect(within(firstCard).getByText('残2日')).toBeTruthy();
    expect(within(firstCard).getByText(/登録 2 \/ 4/)).toBeTruthy();
    expect(within(firstCard).getByText('(50%)')).toBeTruthy();
    expect(within(firstCard).getByText('未登録あり')).toBeTruthy();
    expect(within(firstCard).getByText('詳細を見る')).toBeTruthy();
  });

  it('renders state badge for non-active state', () => {
    const commonItem = {
      tournamentUuid: 't1',
      sourceTournamentUuid: null,
      tournamentName: 'テスト大会',
      owner: 'owner',
      hashtag: 'tag',
      startDate: '2026-02-01',
      endDate: '2026-02-12',
      isImported: false,
      chartCount: 4,
      submittedCount: 2,
      sendWaitingCount: 0,
      pendingCount: 2,
    };

    const { container, rerender } = render(
      <HomePage
        todayDate="2026-02-10"
        state="upcoming"
        items={[commonItem]}
        onOpenDetail={() => undefined}
      />,
    );
    const scoped = within(container);

    expect(scoped.getByText('開催前')).toBeTruthy();
    expect(scoped.getByText('未登録あり')).toBeTruthy();
    expect(scoped.queryByText('残2日')).toBeNull();

    rerender(
      <HomePage
        todayDate="2026-02-10"
        state="ended"
        items={[commonItem]}
        onOpenDetail={() => undefined}
      />,
    );

    expect(scoped.getByText('終了')).toBeTruthy();
    expect(scoped.getByText('未登録あり')).toBeTruthy();
  });

  it('shows open-filter action on empty state', async () => {
    const onOpenFilterInEmpty = vi.fn();
    render(
      <HomePage
        todayDate="2026-02-08"
        state="active"
        items={[]}
        onOpenFilterInEmpty={onOpenFilterInEmpty}
        onOpenDetail={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'フィルタを開く' }));
    expect(onOpenFilterInEmpty).toHaveBeenCalledTimes(1);
  });
});
