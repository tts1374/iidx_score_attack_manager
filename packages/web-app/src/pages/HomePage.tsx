import React from 'react';
import type { TournamentListItem, TournamentTab } from '@iidx/db';
import { useTranslation } from 'react-i18next';

import { resolveTournamentCardStatus } from '../utils/tournament-status';

interface HomePageProps {
  todayDate: string;
  state: TournamentTab;
  items: TournamentListItem[];
  onOpenDetail: (tournamentUuid: string) => void;
  onOpenFilterInEmpty?: () => void;
}

type DeadlineTone = 'normal' | 'warning' | 'urgent';

interface TournamentStateBadge {
  labelKey: 'home.state.active' | 'home.state.upcoming' | 'home.state.ended';
  className: 'statusBadge-ended';
}

function resolveTournamentStateBadge(tab: TournamentTab): TournamentStateBadge {
  if (tab === 'upcoming') {
    return {
      labelKey: 'home.state.upcoming',
      className: 'statusBadge-ended',
    };
  }
  if (tab === 'ended') {
    return {
      labelKey: 'home.state.ended',
      className: 'statusBadge-ended',
    };
  }
  return {
    labelKey: 'home.state.active',
    className: 'statusBadge-ended',
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
  | { className: 'sendWaitingBadge'; labelKey: 'home.progress.badge.send_waiting'; labelOptions: { count: number } }
  | { className: 'pendingBadge'; labelKey: 'home.progress.badge.pending' }
  | { className: 'completedBadge'; labelKey: 'home.progress.badge.completed'; showCheck: true };

function resolveProgressStateBadge(item: TournamentListItem): ProgressStateBadge {
  if (item.sendWaitingCount > 0) {
    return {
      className: 'sendWaitingBadge',
      labelKey: 'home.progress.badge.send_waiting',
      labelOptions: { count: item.sendWaitingCount },
    };
  }
  if (item.submittedCount < item.chartCount) {
    return {
      className: 'pendingBadge',
      labelKey: 'home.progress.badge.pending',
    };
  }
  return {
    className: 'completedBadge',
    labelKey: 'home.progress.badge.completed',
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
  const { t } = useTranslation();
  const stateBadge = React.useMemo(() => resolveTournamentStateBadge(props.state), [props.state]);

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
            const statusInfo = resolveTournamentCardStatus(item.startDate, item.endDate, props.todayDate);
            const progress = item.chartCount > 0 ? Math.round((item.submittedCount / item.chartCount) * 100) : 0;
            const showRemainingDays = props.state === 'active' && statusInfo.daysLeft !== null;
            const deadlineTone = statusInfo.daysLeft !== null ? resolveDeadlineTone(statusInfo.daysLeft) : null;
            const progressBadge = resolveProgressStateBadge(item);

            return (
              <li key={item.tournamentUuid}>
                <button className="tournamentCard" onClick={() => props.onOpenDetail(item.tournamentUuid)}>
                  <div className="tournamentCardStatusRow">
                    <span className={`statusBadge ${stateBadge.className}`}>{t(stateBadge.labelKey)}</span>
                    {showRemainingDays && deadlineTone ? (
                      <span className={`remainingDays remainingDays-${deadlineTone}`}>
                        {t('home.remaining_days', { days: statusInfo.daysLeft })}
                      </span>
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
                      {t('home.progress.summary', { submitted: item.submittedCount, total: item.chartCount })}
                      <span className="progressPercent">{t('home.progress.percent', { percent: progress })}</span>
                    </div>
                    <span className={progressBadge.className}>
                      {'showCheck' in progressBadge ? <span aria-hidden>✓</span> : null}
                      {'labelOptions' in progressBadge
                        ? t(progressBadge.labelKey, progressBadge.labelOptions)
                        : t(progressBadge.labelKey)}
                    </span>
                  </div>
                  <div className="progressBar" aria-hidden>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <div className="cardNavigationHint">
                    <span>{t('home.action.view_detail')}</span>
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

