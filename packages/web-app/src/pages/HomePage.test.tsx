import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('switches tabs and renders pending-focused card status', async () => {
    const onTabChange = vi.fn();

    render(
      <HomePage
        todayDate="2026-02-10"
        tab="active"
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
            pendingCount: 2,
          },
        ]}
        onTabChange={onTabChange}
        onOpenDetail={() => undefined}
      />,
    );

    const firstCard = screen.getAllByRole('listitem')[0]!;
    expect(within(firstCard).getByText('開催中')).toBeTruthy();
    expect(within(firstCard).getByText('残2日')).toBeTruthy();
    expect(within(firstCard).getByText(/提出 2 \/ 4/)).toBeTruthy();
    expect(within(firstCard).getByText('(50%)')).toBeTruthy();
    expect(within(firstCard).getByText('未提出あり')).toBeTruthy();
    expect(within(firstCard).getByText('詳細を見る')).toBeTruthy();

    await userEvent.click(screen.getByRole('tab', { name: '開催前' }));
    expect(onTabChange).toHaveBeenCalledWith('upcoming');
  });

  it('sorts active tab by pending state then end date and shows completion check', () => {
    const { container } = render(
      <HomePage
        todayDate="2026-02-08"
        tab="active"
        items={[
          {
            tournamentUuid: 'done',
            sourceTournamentUuid: null,
            tournamentName: '提出完了',
            owner: 'owner',
            hashtag: 'tag',
            startDate: '2026-02-01',
            endDate: '2026-02-09',
            isImported: false,
            chartCount: 2,
            submittedCount: 2,
            pendingCount: 0,
          },
          {
            tournamentUuid: 'pending-late',
            sourceTournamentUuid: null,
            tournamentName: '未提出・締切遠',
            owner: 'owner',
            hashtag: 'tag',
            startDate: '2026-02-01',
            endDate: '2026-02-12',
            isImported: false,
            chartCount: 4,
            submittedCount: 2,
            pendingCount: 2,
          },
          {
            tournamentUuid: 'pending-soon',
            sourceTournamentUuid: null,
            tournamentName: '未提出・締切近',
            owner: 'owner',
            hashtag: 'tag',
            startDate: '2026-02-01',
            endDate: '2026-02-10',
            isImported: false,
            chartCount: 3,
            submittedCount: 1,
            pendingCount: 2,
          },
        ]}
        onTabChange={() => undefined}
        onOpenDetail={() => undefined}
      />,
    );
    const scoped = within(container);

    expect(scoped.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
      '未提出・締切近',
      '未提出・締切遠',
      '提出完了',
    ]);

    const listItems = scoped.getAllByRole('listitem');
    expect(within(listItems[0]!).getByText('未提出あり')).toBeTruthy();
    expect(within(listItems[2]!).getByText('全提出済')).toBeTruthy();
    expect(within(listItems[2]!).queryByText('未提出あり')).toBeNull();
  });
});
