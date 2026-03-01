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
            sendWaitingCount: 1,
            pendingCount: 2,
          },
        ]}
        onOpenDetail={() => undefined}
      />,
    );

    const firstCard = screen.getAllByRole('listitem')[0]!;
    const statusBadge = firstCard.querySelector('.tournamentStateLabel');
    const remainingDays = firstCard.querySelector('.remainingDays');
    const progressLine = firstCard.querySelector('.progressLine');
    const sendWaitingBadge = firstCard.querySelector('.sendWaitingBadge');
    const sharedSegment = firstCard.querySelector('.progressBarSegment-shared') as HTMLDivElement | null;
    const sendWaitingSegment = firstCard.querySelector('.progressBarSegment-sendWaiting') as HTMLDivElement | null;
    const unregisteredSegment = firstCard.querySelector('.progressBarSegment-unregistered') as HTMLDivElement | null;
    const navigationHint = firstCard.querySelector('.cardNavigationHint > span');

    expect(statusBadge?.textContent?.trim()).toBeTruthy();
    expect(remainingDays?.textContent).toBe('残り2日');
    expect(progressLine?.textContent).toContain('1');
    expect(progressLine?.classList.contains('progressLine-muted')).toBe(false);
    expect(sendWaitingBadge?.textContent?.trim()).toBeTruthy();
    expect(sharedSegment?.style.width).toBe('25%');
    expect(sendWaitingSegment?.style.width).toBe('25%');
    expect(unregisteredSegment?.style.width).toBe('50%');
    expect(navigationHint?.textContent?.trim()).toBeTruthy();
  });

  it('renders state label for non-active state', () => {
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
    const upcomingBadge = container.querySelector('.tournamentStateLabel');
    expect(upcomingBadge?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('.sendWaitingBadge')).toBeNull();
    expect(container.querySelector('.progressLine')?.classList.contains('progressLine-muted')).toBe(true);
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

    const endedBadge = container.querySelector('.tournamentStateLabel');
    expect(endedBadge?.textContent?.trim()).toBeTruthy();
    expect(endedBadge?.textContent).not.toBe(upcomingLabel);
    expect(container.querySelector('.sendWaitingBadge')).toBeNull();
  });

  it('hides progress status badge when there is no unshared chart', () => {
    const { container } = render(
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
            chartCount: 2,
            submittedCount: 2,
            sendWaitingCount: 0,
            pendingCount: 0,
          },
        ]}
        onOpenDetail={() => undefined}
      />,
    );

    expect(container.querySelector('.sendWaitingBadge')).toBeNull();
    expect(container.querySelector('.pendingBadge')).toBeNull();
    expect(container.querySelector('.completedBadge')).toBeNull();
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
