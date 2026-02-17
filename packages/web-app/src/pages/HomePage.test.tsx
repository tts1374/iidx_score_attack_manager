import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('switches tabs and renders progress/remaining badge', async () => {
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

    expect(screen.getByText('提出 2 / 4')).toBeTruthy();
    expect(screen.getByText('残り2日')).toBeTruthy();

    await userEvent.click(screen.getByRole('tab', { name: '開催前' }));
    expect(onTabChange).toHaveBeenCalledWith('upcoming');
  });
});
