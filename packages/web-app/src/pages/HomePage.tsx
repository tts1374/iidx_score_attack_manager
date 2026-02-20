import React from 'react';
import type { TournamentListItem, TournamentTab } from '@iidx/db';

import { resolveTournamentCardStatus } from '../utils/tournament-status';

interface HomePageProps {
  todayDate: string;
  tab: TournamentTab;
  items: TournamentListItem[];
  onTabChange: (tab: TournamentTab) => void;
  onOpenDetail: (tournamentUuid: string) => void;
}

type DeadlineTone = 'normal' | 'warning' | 'urgent';

interface TournamentStateBadge {
  label: '開催中' | '開催前' | '終了';
  className: 'statusBadge-active' | 'statusBadge-upcoming' | 'statusBadge-ended';
}

function resolveTournamentStateBadge(tab: TournamentTab): TournamentStateBadge {
  if (tab === 'upcoming') {
    return {
      label: '開催前',
      className: 'statusBadge-upcoming',
    };
  }
  if (tab === 'ended') {
    return {
      label: '終了',
      className: 'statusBadge-ended',
    };
  }
  return {
    label: '開催中',
    className: 'statusBadge-active',
  };
}

function resolveDeadlineTone(daysLeft: number): DeadlineTone {
  if (daysLeft <= 2) {
    return 'urgent';
  }
  if (daysLeft <= 7) {
    return 'warning';
  }
  return 'normal';
}

function sortForActiveTab(a: TournamentListItem, b: TournamentListItem): number {
  const aHasPending = a.pendingCount > 0;
  const bHasPending = b.pendingCount > 0;
  if (aHasPending !== bHasPending) {
    return aHasPending ? -1 : 1;
  }

  const endDateComparison = a.endDate.localeCompare(b.endDate);
  if (endDateComparison !== 0) {
    return endDateComparison;
  }

  const startDateComparison = a.startDate.localeCompare(b.startDate);
  if (startDateComparison !== 0) {
    return startDateComparison;
  }

  return a.tournamentName.localeCompare(b.tournamentName, 'ja');
}

export function HomePage(props: HomePageProps): JSX.Element {
  const stateBadge = React.useMemo(() => resolveTournamentStateBadge(props.tab), [props.tab]);
  const displayItems = React.useMemo(() => {
    if (props.tab !== 'active') {
      return props.items;
    }
    return [...props.items].sort(sortForActiveTab);
  }, [props.items, props.tab]);

  return (
    <div className="page tournamentListPage">
      <section className="tabRow" role="tablist" aria-label="tournament-tabs">
        <button
          className={props.tab === 'active' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'active'}
          onClick={() => props.onTabChange('active')}
        >
          開催中
        </button>
        <button
          className={props.tab === 'upcoming' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'upcoming'}
          onClick={() => props.onTabChange('upcoming')}
        >
          開催前
        </button>
        <button
          className={props.tab === 'ended' ? 'active' : ''}
          role="tab"
          aria-selected={props.tab === 'ended'}
          onClick={() => props.onTabChange('ended')}
        >
          終了
        </button>
      </section>

      {displayItems.length === 0 ? (
        <p className="emptyText">表示できる大会がありません。</p>
      ) : (
        <ul className="cardList">
          {displayItems.map((item) => {
            const statusInfo = resolveTournamentCardStatus(item.startDate, item.endDate, props.todayDate);
            const progress = item.chartCount > 0 ? Math.round((item.submittedCount / item.chartCount) * 100) : 0;
            const showRemainingDays = props.tab === 'active' && statusInfo.daysLeft !== null;
            const deadlineTone = statusInfo.daysLeft !== null ? resolveDeadlineTone(statusInfo.daysLeft) : null;
            const allSubmitted = item.pendingCount === 0;
            const showPendingBadge = props.tab === 'active' && !allSubmitted;

            return (
              <li key={item.tournamentUuid}>
                <button className="tournamentCard" onClick={() => props.onOpenDetail(item.tournamentUuid)}>
                  <div className="tournamentCardStatusRow">
                    <span className={`statusBadge ${stateBadge.className}`}>{stateBadge.label}</span>
                    {showRemainingDays && deadlineTone ? (
                      <span className={`remainingDays remainingDays-${deadlineTone}`}>残{statusInfo.daysLeft}日</span>
                    ) : null}
                  </div>
                  <div className="tournamentCardHeader">
                    <h3>{item.tournamentName}</h3>
                  </div>
                  <div className="tournamentMeta">
                    <div className="ownerLine">{item.owner}</div>
                  </div>
                  <div className="progressSummaryRow">
                    <div className="progressLine">
                      提出 {item.submittedCount} / {item.chartCount}
                      <span className="progressPercent">({progress}%)</span>
                    </div>
                    {allSubmitted ? (
                      <span className="completedBadge" aria-label="全提出済">
                        <span aria-hidden>✓</span>
                        全提出済
                      </span>
                    ) : showPendingBadge ? (
                      <span className="pendingBadge">未提出あり</span>
                    ) : null}
                  </div>
                  <div className="progressBar" aria-hidden>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <div className="cardNavigationHint">
                    <span>詳細を見る</span>
                    <span className="cardArrow" aria-hidden>
                      →
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

