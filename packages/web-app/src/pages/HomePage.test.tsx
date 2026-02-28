import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    const statusBadge = firstCard.querySelector('.statusBadge');
    const remainingDays = firstCard.querySelector('.remainingDays');
    const progressLine = firstCard.querySelector('.progressLine');
    const progressPercent = firstCard.querySelector('.progressPercent');
    const pendingBadge = firstCard.querySelector('.pendingBadge');
    const navigationHint = firstCard.querySelector('.cardNavigationHint > span');

    expect(statusBadge?.textContent?.trim()).toBeTruthy();
    expect(remainingDays?.textContent).toContain('2');
    expect(progressLine?.textContent).toContain('2');
    expect(progressLine?.textContent).toContain('4');
    expect(progressPercent?.textContent).toBe('(50%)');
    expect(pendingBadge?.textContent?.trim()).toBeTruthy();
    expect(navigationHint?.textContent?.trim()).toBeTruthy();
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
    const upcomingBadge = container.querySelector('.statusBadge');
    expect(upcomingBadge?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('.pendingBadge')?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('.remainingDays')).toBeNull();
    const upcomingLabel = upcomingBadge?.textContent;

    rerender(
      <HomePage
        todayDate="2026-02-10"
        state="ended"
        items={[commonItem]}
        onOpenDetail={() => undefined}
      />,
    );

    const endedBadge = container.querySelector('.statusBadge');
    expect(endedBadge?.textContent?.trim()).toBeTruthy();
    expect(endedBadge?.textContent).not.toBe(upcomingLabel);
    expect(container.querySelector('.pendingBadge')?.textContent?.trim()).toBeTruthy();
  });

  it('shows open-filter action on empty state', async () => {
    const onOpenFilterInEmpty = vi.fn();
    const { container } = render(
      <HomePage
        todayDate="2026-02-08"
        state="active"
        items={[]}
        onOpenFilterInEmpty={onOpenFilterInEmpty}
        onOpenDetail={() => undefined}
      />,
    );
    const emptyResetButton = container.querySelector('.emptyResetButton');
    expect(emptyResetButton).toBeTruthy();
    await userEvent.click(emptyResetButton as HTMLButtonElement);
    expect(onOpenFilterInEmpty).toHaveBeenCalledTimes(1);
  });
});
