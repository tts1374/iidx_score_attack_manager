import React from 'react';
import type { TournamentListItem, TournamentTab } from '@iidx/db';

import { resolveTournamentCardStatus } from '../utils/tournament-status';

interface HomePageProps {
  todayDate: string;
  state: TournamentTab;
  items: TournamentListItem[];
  onOpenDetail: (tournamentUuid: string) => void;
  showClearAllInEmpty?: boolean;
  onClearAllFilters?: () => void;
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

type ProgressStateBadge =
  | { className: 'sendWaitingBadge'; label: string }
  | { className: 'pendingBadge'; label: '未登録あり' }
  | { className: 'completedBadge'; label: '全て登録済'; showCheck: true };

function resolveProgressStateBadge(item: TournamentListItem): ProgressStateBadge {
  if (item.sendWaitingCount > 0) {
    return {
      className: 'sendWaitingBadge',
      label: `送信待ち ${item.sendWaitingCount}件`,
    };
  }
  if (item.submittedCount < item.chartCount) {
    return {
      className: 'pendingBadge',
      label: '未登録あり',
    };
  }
  return {
    className: 'completedBadge',
    label: '全て登録済',
    showCheck: true,
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
  const stateBadge = React.useMemo(() => resolveTournamentStateBadge(props.state), [props.state]);

  return (
    <div className="page tournamentListPage">
      {props.items.length === 0 ? (
        <div className="emptyState">
          <p className="emptyText">表示できる大会がありません。</p>
          {props.showClearAllInEmpty && props.onClearAllFilters ? (
            <button type="button" className="emptyResetButton" onClick={props.onClearAllFilters}>
              すべて解除
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="cardList">
          {props.items.map((item) => {
            const statusInfo = resolveTournamentCardStatus(item.startDate, item.endDate, props.todayDate);
            const progress = item.chartCount > 0 ? Math.round((item.submittedCount / item.chartCount) * 100) : 0;
            const showRemainingDays = props.state === 'active' && statusInfo.daysLeft !== null;
            const deadlineTone = statusInfo.daysLeft !== null ? resolveDeadlineTone(statusInfo.daysLeft) : null;
            const progressBadge = resolveProgressStateBadge(item);

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
                      登録 {item.submittedCount} / {item.chartCount}
                      <span className="progressPercent">({progress}%)</span>
                    </div>
                    <span className={progressBadge.className}>
                      {'showCheck' in progressBadge ? <span aria-hidden>✓</span> : null}
                      {progressBadge.label}
                    </span>
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

