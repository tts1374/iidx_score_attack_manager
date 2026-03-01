import React from 'react';
import { daysUntilStart } from '@iidx/shared';
import { useTranslation } from 'react-i18next';

import type { TournamentStatus } from '../utils/tournament-status';
import { resolveTournamentCardStatus } from '../utils/tournament-status';

type TournamentSummaryVariant = 'list' | 'detail' | 'preview';
type RelativeTone = 'normal' | 'warning' | 'urgent';

interface TournamentSummaryCardProps {
  variant: TournamentSummaryVariant;
  title: string;
  startDate: string;
  endDate: string;
  todayDate: string;
  periodText?: string;
  unregisteredCount?: number;
  unsharedCount?: number;
  sharedCount?: number;
  cardClassName?: string;
  onOpenDetail?: (() => void) | undefined;
  shareAction?: React.ReactNode;
}

function joinClasses(...values: Array<string | undefined | null | false>): string {
  return values.filter(Boolean).join(' ');
}

function resolveStateLabelKey(status: TournamentStatus): 'home.state.active' | 'home.state.upcoming' | 'home.state.ended' {
  if (status === 'upcoming') {
    return 'home.state.upcoming';
  }
  if (status === 'ended') {
    return 'home.state.ended';
  }
  return 'home.state.active';
}

function resolveRelativeTone(status: TournamentStatus): RelativeTone {
  if (status === 'active-warning') {
    return 'warning';
  }
  if (status === 'active-danger' || status === 'active-today') {
    return 'urgent';
  }
  return 'normal';
}

export function TournamentSummaryCard(props: TournamentSummaryCardProps): JSX.Element {
  const { t } = useTranslation();
  const statusInfo = React.useMemo(
    () => resolveTournamentCardStatus(props.startDate, props.endDate, props.todayDate),
    [props.endDate, props.startDate, props.todayDate],
  );
  const stateLabel = t(resolveStateLabelKey(statusInfo.status));
  const relativeTone = resolveRelativeTone(statusInfo.status);
  const relativeStatusLabel =
    statusInfo.status === 'upcoming'
      ? t('common.tournament_status.days_until_start', { count: Math.max(0, daysUntilStart(props.startDate, props.todayDate)) })
      : statusInfo.status === 'ended'
        ? null
        : t('tournament_detail.status.active_remaining_days', { count: Math.max(0, statusInfo.daysLeft ?? 0) });
  const periodText = props.periodText ?? `${props.startDate} 〜 ${props.endDate}`;
  const safeSharedCount = Math.max(0, props.sharedCount ?? 0);
  const safeUnsharedCount = Math.max(0, props.unsharedCount ?? 0);
  const safeUnregisteredCount = Math.max(0, props.unregisteredCount ?? 0);
  const totalCount = safeSharedCount + safeUnsharedCount + safeUnregisteredCount;
  const sharedPercent = totalCount > 0 ? (safeSharedCount / totalCount) * 100 : 0;
  const unsharedPercent = totalCount > 0 ? (safeUnsharedCount / totalCount) * 100 : 0;
  const unregisteredPercent = totalCount > 0 ? (safeUnregisteredCount / totalCount) * 100 : 0;
  const showPeriod = props.variant !== 'list';
  const showIncompleteLabels = (props.variant === 'list' || props.variant === 'detail') && (safeUnregisteredCount > 0 || safeUnsharedCount > 0);
  const showProgress = props.variant === 'list' || props.variant === 'detail';
  const showDetailLink = props.variant === 'list';
  const showShareAction = props.variant === 'detail' && Boolean(props.shareAction);
  const baseClassName =
    props.variant === 'list'
      ? 'tournamentCard tournamentSummaryCard tournamentSummaryCard-list'
      : `detailCard tournamentDetailSummaryCard tournamentSummaryCard tournamentSummaryCard-${props.variant}`;
  const rootClassName = joinClasses(baseClassName, props.cardClassName);
  const title = props.variant === 'list' ? <h3 className="tournamentSummaryTitle">{props.title}</h3> : <h2 className="tournamentSummaryTitle">{props.title}</h2>;
  const content = (
    <div className="tournamentSummaryCardLayout">
      <div className="tournamentSummaryCardMain">
        <div className="tournamentCardStatusRow tournamentSummaryStatusRow">
          <span className="tournamentStateLabel">{stateLabel}</span>
          {relativeStatusLabel ? (
            <span className={`remainingDays remainingDays-${relativeTone}`} data-testid={`tournament-summary-relative-${props.variant}`}>
              {relativeStatusLabel}
            </span>
          ) : null}
        </div>
        {title}
        {showPeriod ? <p className="periodLine tournamentSummaryPeriod">{periodText}</p> : null}
        {showIncompleteLabels ? (
          <div className="tournamentStatusLabelRow" data-testid={`tournament-summary-incomplete-row-${props.variant}`}>
            {safeUnregisteredCount > 0 ? (
              <span
                className="tournamentStatusLabel tournamentStatusLabel-unregistered"
                data-testid={`tournament-summary-incomplete-unregistered-${props.variant}`}
              >
                {t('home.progress.badge.pending', { count: safeUnregisteredCount })} {safeUnregisteredCount}
              </span>
            ) : null}
            {safeUnsharedCount > 0 ? (
              <span
                className="tournamentStatusLabel tournamentStatusLabel-unshared"
                data-testid={`tournament-summary-incomplete-unshared-${props.variant}`}
              >
                {t('home.progress.badge.send_waiting', { count: safeUnsharedCount })} {safeUnsharedCount}
              </span>
            ) : null}
          </div>
        ) : null}
        {showProgress ? (
          <div className="progressBar stateDistributionBar tournamentSummaryProgress" aria-hidden>
            <div className="progressBarSegment-shared" style={{ width: `${sharedPercent}%` }} />
            <div className="progressBarSegment-sendWaiting" style={{ width: `${unsharedPercent}%` }} />
            <div className="progressBarSegment-unregistered" style={{ width: `${unregisteredPercent}%` }} />
          </div>
        ) : null}
        {showDetailLink ? (
          <div className="cardNavigationHint">
            <span>{t('home.action.view_detail')}</span>
            <span className="cardArrow" aria-hidden>
              →
            </span>
          </div>
        ) : null}
      </div>
      {showShareAction ? <div className="tournamentSummaryCardSide">{props.shareAction}</div> : null}
    </div>
  );

  if (props.variant === 'list') {
    return (
      <button type="button" className={rootClassName} onClick={props.onOpenDetail}>
        {content}
      </button>
    );
  }

  return <section className={rootClassName}>{content}</section>;
}
