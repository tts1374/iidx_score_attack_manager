import React from 'react';
import type { TournamentListItem, TournamentTab } from '@iidx/db';
import { useTranslation } from 'react-i18next';

import { TournamentSummaryCard } from '../components/TournamentSummaryCard';

interface HomePageProps {
  todayDate: string;
  state: TournamentTab;
  items: TournamentListItem[];
  onOpenDetail: (tournamentUuid: string) => void;
  onOpenFilterInEmpty?: () => void;
}

interface ProgressDistribution {
  sharedCount: number;
  sendWaitingCount: number;
  unregisteredCount: number;
}

function resolveProgressDistribution(item: TournamentListItem): ProgressDistribution {
  const total = Math.max(0, item.chartCount);
  if (total <= 0) {
    return {
      sharedCount: 0,
      sendWaitingCount: 0,
      unregisteredCount: 0,
    };
  }

  const submittedCount = Math.max(0, Math.min(total, item.submittedCount));
  const sendWaitingCount = Math.max(0, Math.min(submittedCount, item.sendWaitingCount));
  const sharedCount = Math.max(0, submittedCount - sendWaitingCount);
  const unregisteredCount = Math.max(0, total - submittedCount);

  return {
    sharedCount,
    sendWaitingCount,
    unregisteredCount,
  };
}

function resolveActivePriority(item: TournamentListItem): number {
  if (item.sendWaitingCount > 0) {
    return 0;
  }
  if (item.submittedCount < item.chartCount) {
    return 1;
  }
  return 2;
}

export function sortForActiveTab(a: TournamentListItem, b: TournamentListItem): number {
  const groupComparison = resolveActivePriority(a) - resolveActivePriority(b);
  if (groupComparison !== 0) {
    return groupComparison;
  }

  const endDateComparison = a.endDate.localeCompare(b.endDate);
  if (endDateComparison !== 0) {
    return endDateComparison;
  }

  const startDateComparison = a.startDate.localeCompare(b.startDate);
  if (startDateComparison !== 0) {
    return startDateComparison;
  }

  const nameComparison = a.tournamentName.localeCompare(b.tournamentName, 'ja');
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return a.tournamentUuid.localeCompare(b.tournamentUuid);
}

export function HomePage(props: HomePageProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="page tournamentListPage">
      {props.items.length === 0 ? (
        <div className="emptyState">
          <p className="emptyText">{t('home.empty.text')}</p>
          {props.onOpenFilterInEmpty ? (
            <button type="button" className="emptyResetButton" onClick={props.onOpenFilterInEmpty}>
              {t('home.empty.action.open_filter')}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="cardList">
          {props.items.map((item) => {
            const progress = resolveProgressDistribution(item);

            return (
              <li key={item.tournamentUuid}>
                <TournamentSummaryCard
                  variant="list"
                  title={item.tournamentName}
                  startDate={item.startDate}
                  endDate={item.endDate}
                  todayDate={props.todayDate}
                  sharedCount={progress.sharedCount}
                  unsharedCount={progress.sendWaitingCount}
                  unregisteredCount={progress.unregisteredCount}
                  onOpenDetail={() => props.onOpenDetail(item.tournamentUuid)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

