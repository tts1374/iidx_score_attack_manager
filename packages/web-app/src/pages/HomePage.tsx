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

type TournamentStateLabelKey = 'home.state.active' | 'home.state.upcoming' | 'home.state.ended';

function resolveTournamentStateLabel(tab: TournamentTab): TournamentStateLabelKey {
  if (tab === 'upcoming') {
    return 'home.state.upcoming';
  }
  if (tab === 'ended') {
    return 'home.state.ended';
  }
  return 'home.state.active';
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

interface ProgressDistribution {
  sharedCount: number;
  sendWaitingCount: number;
  unregisteredCount: number;
  sharedRate: number;
  sendWaitingRate: number;
  unregisteredRate: number;
}

function resolveProgressDistribution(item: TournamentListItem): ProgressDistribution {
  const total = Math.max(0, item.chartCount);
  if (total <= 0) {
    return {
      sharedCount: 0,
      sendWaitingCount: 0,
      unregisteredCount: 0,
      sharedRate: 0,
      sendWaitingRate: 0,
      unregisteredRate: 0,
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
    sharedRate: sharedCount / total,
    sendWaitingRate: sendWaitingCount / total,
    unregisteredRate: unregisteredCount / total,
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
  const stateLabel = React.useMemo(() => resolveTournamentStateLabel(props.state), [props.state]);

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
            const progress = resolveProgressDistribution(item);
            const showRemainingDays = props.state === 'active' && statusInfo.daysLeft !== null;
            const deadlineTone = statusInfo.daysLeft !== null ? resolveDeadlineTone(statusInfo.daysLeft) : null;

            return (
              <li key={item.tournamentUuid}>
                <button className="tournamentCard" onClick={() => props.onOpenDetail(item.tournamentUuid)}>
                  <div className="tournamentCardStatusRow">
                    <span className="tournamentStateLabel">{t(stateLabel)}</span>
                    {showRemainingDays && deadlineTone ? (
                      <span className={`remainingDays remainingDays-${deadlineTone}`}>
                        {statusInfo.label}
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
                    <div className={`progressLine ${progress.sendWaitingCount === 0 ? 'progressLine-muted' : ''}`}>
                      {t('home.progress.send_waiting_count', { count: progress.sendWaitingCount })}
                    </div>
                    {progress.sendWaitingCount > 0 ? (
                      <span className="sendWaitingBadge">{t('home.progress.badge.send_waiting')}</span>
                    ) : null}
                  </div>
                  <div className="progressBar stateDistributionBar" aria-hidden>
                    <div className="progressBarSegment-shared" style={{ width: `${progress.sharedRate * 100}%` }} />
                    <div className="progressBarSegment-sendWaiting" style={{ width: `${progress.sendWaitingRate * 100}%` }} />
                    <div
                      className="progressBarSegment-unregistered"
                      style={{ width: `${progress.unregisteredRate * 100}%` }}
                    />
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

