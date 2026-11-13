import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HomePage } from './HomePage';
import { TournamentSummaryCard } from '../components/TournamentSummaryCard';
import { ensureI18n } from '../i18n';

const progressCases = [
  { shared: 0, unshared: 0, unregistered: 4, registered: 0, total: 4 },
  { shared: 0, unshared: 4, unregistered: 0, registered: 4, total: 4 },
  { shared: 1, unshared: 1, unregistered: 2, registered: 2, total: 4 },
  { shared: 4, unshared: 0, unregistered: 0, registered: 4, total: 4 },
  { shared: 0, unshared: 0, unregistered: 0, registered: 0, total: 0 },
];

describe.each([
  { language: 'ja' as const, registeredLabel: '画像登録', completed: 'すべて共有済', labels: ['共有済', '未共有', '未登録'] },
  { language: 'en' as const, registeredLabel: 'Images registered', completed: 'All shared', labels: ['Shared', 'not shared', 'not registered'] },
  { language: 'ko' as const, registeredLabel: '이미지 등록', completed: '모두 공유됨', labels: ['공유됨', '미공유', '미등록'] },
])('Home progress ($language)', ({ language, registeredLabel, completed, labels }) => {
  it.each(progressCases)('exposes registration and all counts: $registered/$total ($shared shared)', async (counts) => {
    await ensureI18n(language);
    const { container } = render(
      <TournamentSummaryCard variant="list" title="テスト大会" startDate="2026-02-01" endDate="2026-02-12"
        todayDate="2026-02-10" prefersReducedMotion sharedCount={counts.shared}
        unsharedCount={counts.unshared} unregisteredCount={counts.unregistered} />,
    );
    const visibleProgress = `${registeredLabel} ${counts.registered}/${counts.total}`;
    const card = screen.getByRole('button', {
      name: /テスト大会/,
      description: new RegExp(`${visibleProgress}.*${labels[0]} ${counts.shared}.*${labels[1]} ${counts.unshared}.*${labels[2]} ${counts.unregistered}`),
    });
    expect(container.querySelector('.tournamentProgressValue')?.textContent).toBe(visibleProgress);
    expect(card.getAttribute('aria-describedby')).toBeTruthy();
    expect(Boolean(screen.queryByText(completed))).toBe(counts.total > 0 && counts.shared === counts.total);
    // Progress has one accessible description; visual badges and values do not repeat it in the name.
    expect(screen.queryByRole('button', { name: new RegExp(registeredLabel) })).toBeNull();
    cleanup();
  });
});

describe('Home progress updates', () => {
  it('updates the same card after registration and sharing and keeps mouse/keyboard navigation', async () => {
    const onOpenDetail = vi.fn();
    const item = {
      tournamentUuid: 'progress-card', sourceTournamentUuid: null, tournamentName: '長いスコアタ名'.repeat(6),
      owner: 'owner', hashtag: 'tag', startDate: '2026-02-01', endDate: '2026-02-12', isImported: false,
      chartCount: 4, submittedCount: 0, sendWaitingCount: 0, pendingCount: 4,
    };
    const renderHome = (submittedCount: number, sendWaitingCount: number) => (
      <HomePage todayDate="2026-02-10" state="active" prefersReducedMotion
        items={[{ ...item, submittedCount, sendWaitingCount }]} onOpenDetail={onOpenDetail} />
    );
    const { container, rerender } = render(renderHome(0, 0));
    const card = screen.getByRole('button', { name: new RegExp(item.tournamentName), description: /画像登録 0\/4。共有済 0、未共有 0、未登録 4/ });
    const descriptionId = card.getAttribute('aria-describedby');
    rerender(renderHome(4, 4));
    expect(screen.getByRole('button', { description: /画像登録 4\/4。共有済 0、未共有 4、未登録 0/ })).toBe(card);
    expect(container.querySelector('.tournamentProgressValue')?.textContent).toBe('画像登録 4/4');
    rerender(renderHome(4, 0));
    expect(screen.getByRole('button', { description: /画像登録 4\/4。共有済 4、未共有 0、未登録 0/ })).toBe(card);
    expect(card.getAttribute('aria-describedby')).toBe(descriptionId);
    expect(screen.getByText('すべて共有済')).toBeTruthy();
    await userEvent.click(card);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onOpenDetail.mock.calls).toEqual([[item.tournamentUuid], [item.tournamentUuid], [item.tournamentUuid]]);
    cleanup();
  });

  it('leaves the detail and import preview progress summaries unchanged', () => {
    const props = { title: 'テスト大会', startDate: '2026-02-01', endDate: '2026-02-12', todayDate: '2026-02-10',
      prefersReducedMotion: true, sharedCount: 1, unsharedCount: 1, unregisteredCount: 2 };
    const { container, rerender } = render(<TournamentSummaryCard {...props} variant="detail" />);
    expect(container.querySelector('.tournamentProgressValue')?.textContent).toBe('2/4');
    expect(screen.getByTestId('tournament-summary-incomplete-row-detail').getAttribute('aria-hidden')).toBeNull();
    expect(container.querySelector('[aria-describedby]')).toBeNull();
    rerender(<TournamentSummaryCard {...props} variant="preview" />);
    expect(container.querySelector('.tournamentSummaryProgressWrap')).toBeNull();
    expect(container.querySelector('[aria-describedby]')).toBeNull();
    cleanup();
  });
});

describe('HomePage', () => {
  it('renders active tournament card with remaining days', () => {
    render(
      <HomePage
        todayDate="2026-02-10"
        state="active"
        prefersReducedMotion
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
    const unregisteredLabel = screen.queryByTestId('tournament-summary-incomplete-unregistered-list');
    const unsharedLabel = screen.queryByTestId('tournament-summary-incomplete-unshared-list');
    const sharedSegment = firstCard.querySelector('.progressBarSegment-shared') as HTMLDivElement | null;
    const sendWaitingSegment = firstCard.querySelector('.progressBarSegment-sendWaiting') as HTMLDivElement | null;
    const unregisteredSegment = firstCard.querySelector('.progressBarSegment-unregistered') as HTMLDivElement | null;
    const navigationHint = firstCard.querySelector('.cardNavigationHint > span');

    expect(statusBadge?.textContent?.trim()).toBeTruthy();
    expect(remainingDays?.textContent).toBe('残り2日');
    expect(unregisteredLabel?.textContent).toContain('2');
    expect(unsharedLabel?.textContent?.trim()).toBeTruthy();
    expect(sharedSegment?.style.width).toBe('25%');
    expect(sendWaitingSegment?.style.width).toBe('25%');
    expect(unregisteredSegment?.style.width).toBe('50%');
    expect(navigationHint?.textContent?.trim()).toBeTruthy();
  });

  it('renders state label for non-active state', () => {
    const upcomingItem = {
      tournamentUuid: 't1',
      sourceTournamentUuid: null,
      tournamentName: 'テスト大会',
      owner: 'owner',
      hashtag: 'tag',
      startDate: '2026-02-20',
      endDate: '2026-02-25',
      isImported: false,
      chartCount: 2,
      submittedCount: 2,
      sendWaitingCount: 0,
      pendingCount: 0,
    };
    const endedItem = {
      ...upcomingItem,
      startDate: '2026-01-01',
      endDate: '2026-01-05',
    };

    const { container, rerender } = render(
      <HomePage
        todayDate="2026-02-10"
        state="upcoming"
        prefersReducedMotion
        items={[upcomingItem]}
        onOpenDetail={() => undefined}
      />,
    );
    const upcomingBadge = container.querySelector('.tournamentStateLabel');
    expect(upcomingBadge?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('.remainingDays')?.textContent?.trim()).toBeTruthy();
    expect(container.querySelector('[data-testid="tournament-summary-incomplete-unshared-list"]')).toBeNull();
    const upcomingLabel = upcomingBadge?.textContent;

    rerender(
      <HomePage
        todayDate="2026-02-10"
        state="ended"
        prefersReducedMotion
        items={[endedItem]}
        onOpenDetail={() => undefined}
      />,
    );

    const endedBadge = container.querySelector('.tournamentStateLabel');
    expect(endedBadge?.textContent?.trim()).toBeTruthy();
    expect(endedBadge?.textContent).not.toBe(upcomingLabel);
    expect(container.querySelector('.remainingDays')).toBeNull();
    expect(container.querySelector('[data-testid="tournament-summary-incomplete-unshared-list"]')).toBeNull();
  });

  it('hides progress status badge when there is no unshared chart', () => {
    const { container } = render(
      <HomePage
        todayDate="2026-02-10"
        state="active"
        prefersReducedMotion
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

    expect(container.querySelector('[data-testid="tournament-summary-incomplete-unshared-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="tournament-summary-incomplete-unregistered-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="tournament-summary-incomplete-row-list"]')).toBeNull();
  });

  it('shows open-filter action on empty state', async () => {
    const onOpenFilterInEmpty = vi.fn();
    const { container } = render(
      <HomePage
        todayDate="2026-02-08"
        state="active"
        prefersReducedMotion
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

  it('shows public catalog CTA on empty state when provided', async () => {
    const onOpenPublicCatalogInEmpty = vi.fn();

    render(
      <HomePage
        todayDate="2026-02-08"
        state="active"
        prefersReducedMotion
        items={[]}
        onOpenPublicCatalogInEmpty={onOpenPublicCatalogInEmpty}
        onOpenDetail={() => undefined}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: '公開スコアタを探す' }),
    );

    expect(onOpenPublicCatalogInEmpty).toHaveBeenCalledTimes(1);
  });

  it('shows publication status for local tournaments and hides it for imported tournaments', () => {
    cleanup();
    const { container, rerender } = render(
      <HomePage
        todayDate="2026-02-10"
        state="active"
        prefersReducedMotion
        items={[
          {
            tournamentUuid: 't1',
            sourceTournamentUuid: null,
            tournamentName: '公開大会',
            owner: 'owner',
            hashtag: 'tag',
            startDate: '2026-02-01',
            endDate: '2026-02-12',
            isImported: false,
            chartCount: 1,
            submittedCount: 0,
            sendWaitingCount: 0,
            pendingCount: 1,
            publicStatus: 'retryable',
          },
        ]}
        onOpenDetail={() => undefined}
      />,
    );

    expect(container.querySelector('[data-testid="tournament-summary-publication-list"]')?.textContent).toBe('未公開（再試行可）');

    rerender(
      <HomePage
        todayDate="2026-02-10"
        state="active"
        prefersReducedMotion
        items={[
          {
            tournamentUuid: 't2',
            sourceTournamentUuid: 'public-1',
            tournamentName: '取込大会',
            owner: 'owner',
            hashtag: 'tag',
            startDate: '2026-02-01',
            endDate: '2026-02-12',
            isImported: true,
            chartCount: 1,
            submittedCount: 0,
            sendWaitingCount: 0,
            pendingCount: 1,
            publicStatus: 'published',
          },
        ]}
        onOpenDetail={() => undefined}
      />,
    );

    expect(container.querySelector('[data-testid="tournament-summary-publication-list"]')).toBeNull();
  });
});
