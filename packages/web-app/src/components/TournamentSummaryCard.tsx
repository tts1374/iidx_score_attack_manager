import React from 'react';
import { daysUntilStart } from '@iidx/shared';
import type { TournamentPublicationStatus } from '@iidx/db';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import PublicOffOutlinedIcon from '@mui/icons-material/PublicOffOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
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
  prefersReducedMotion?: boolean;
  animateProgress?: boolean;
  publicationStatus?: TournamentPublicationStatus;
  showPublicationStatus?: boolean;
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

function resolvePublicationLabelKey(status: TournamentPublicationStatus): string {
  if (status === 'publishing') {
    return 'public_catalog.status.publishing';
  }
  if (status === 'published') {
    return 'public_catalog.status.published';
  }
  if (status === 'retryable') {
    return 'public_catalog.status.retryable';
  }
  return 'public_catalog.status.unpublished';
}

export function TournamentSummaryCard(props: TournamentSummaryCardProps): JSX.Element {
  const { t } = useTranslation();
  const progressDescriptionId = React.useId();
  const theme = useTheme();
  const prefersReducedMotion = props.prefersReducedMotion ?? false;
  const progressBarTransition = React.useMemo(
    () =>
      theme.transitions.create('width', {
        duration: prefersReducedMotion ? 0 : 200,
        easing: theme.transitions.easing.easeOut,
      }),
    [prefersReducedMotion, theme],
  );
  const progressValueTransition = React.useMemo(
    () =>
      theme.transitions.create('opacity', {
        duration: prefersReducedMotion ? 0 : 200,
        easing: theme.transitions.easing.easeOut,
      }),
    [prefersReducedMotion, theme],
  );
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
  const shouldAnimateProgress = Boolean(props.animateProgress ?? (props.variant === 'list')) && !prefersReducedMotion;
  const submittedCount = safeSharedCount + safeUnsharedCount;
  const progressValueText = `${submittedCount}/${totalCount}`;
  const registeredLabel = t('home.progress.registered', { registered: submittedCount, total: totalCount });
  const allShared = props.variant === 'list' && totalCount > 0 && safeSharedCount === totalCount;
  const showDetailLink = props.variant === 'list';
  const showShareAction = props.variant === 'detail' && Boolean(props.shareAction);
  const publicationStatus = props.publicationStatus ?? 'unpublished';
  const showPublicationStatus = Boolean(props.showPublicationStatus);
  const publicationLabel = t(`home.publication.${publicationStatus}`);
  const PublicationIcon = publicationStatus === 'published' ? PublicOutlinedIcon
    : publicationStatus === 'publishing' ? SyncOutlinedIcon
      : publicationStatus === 'retryable' ? ErrorOutlineOutlinedIcon : PublicOffOutlinedIcon;
  const [displayedProgress, setDisplayedProgress] = React.useState(() => ({
    shared: shouldAnimateProgress ? 0 : sharedPercent,
    unshared: shouldAnimateProgress ? 0 : unsharedPercent,
    unregistered: shouldAnimateProgress ? 0 : unregisteredPercent,
  }));
  const [progressValueVisible, setProgressValueVisible] = React.useState(() => !showProgress || !shouldAnimateProgress);

  React.useEffect(() => {
    if (!shouldAnimateProgress) {
      setDisplayedProgress({
        shared: sharedPercent,
        unshared: unsharedPercent,
        unregistered: unregisteredPercent,
      });
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      setDisplayedProgress({
        shared: sharedPercent,
        unshared: unsharedPercent,
        unregistered: unregisteredPercent,
      });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [sharedPercent, shouldAnimateProgress, unsharedPercent, unregisteredPercent]);

  React.useEffect(() => {
    if (!showProgress) {
      setProgressValueVisible(false);
      return;
    }
    if (!shouldAnimateProgress) {
      setProgressValueVisible(true);
      return;
    }
    setProgressValueVisible(false);
    const timeoutId = window.setTimeout(() => {
      setProgressValueVisible(true);
    }, 50);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showProgress, shouldAnimateProgress, submittedCount, totalCount]);
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
        {props.variant === 'list' ? (
          <div className="tournamentSummaryTitleRow">
            {title}
            {showPublicationStatus ? (
              <span className={`tournamentPublicationIcon tournamentPublicationIcon-${publicationStatus}`}
                role="img" aria-label={publicationLabel} title={publicationLabel}
                data-testid="tournament-summary-publication-list">
                <PublicationIcon fontSize="inherit" />
              </span>
            ) : null}
          </div>
        ) : title}
        {showPeriod ? <p className="periodLine tournamentSummaryPeriod">{periodText}</p> : null}
        {showIncompleteLabels ? (
          <div className="tournamentStatusLabelRow" data-testid={`tournament-summary-incomplete-row-${props.variant}`} aria-hidden={props.variant === 'list' || undefined}>
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
        {allShared ? (
          <div className="tournamentStatusLabelRow" aria-hidden>
            <span className="tournamentStatusLabel tournamentStatusLabel-shared">{t('home.progress.all_shared')}</span>
          </div>
        ) : null}
        {showPublicationStatus && props.variant !== 'list' ? (
          <div className="tournamentStatusLabelRow" data-testid={`tournament-summary-publication-row-${props.variant}`}>
            <span
              className={joinClasses(
                'tournamentStatusLabel',
                'tournamentStatusLabel-publication',
                `tournamentStatusLabel-publication-${publicationStatus}`,
              )}
              data-testid={`tournament-summary-publication-${props.variant}`}
            >
              {t(resolvePublicationLabelKey(publicationStatus))}
            </span>
          </div>
        ) : null}
        {showProgress ? (
          <div className="tournamentSummaryProgressWrap">
            <div className="progressBar stateDistributionBar tournamentSummaryProgress" aria-hidden>
              <div className="progressBarSegment-shared" style={{ width: `${displayedProgress.shared}%`, transition: progressBarTransition }} />
              <div className="progressBarSegment-sendWaiting" style={{ width: `${displayedProgress.unshared}%`, transition: progressBarTransition }} />
              <div className="progressBarSegment-unregistered" style={{ width: `${displayedProgress.unregistered}%`, transition: progressBarTransition }} />
            </div>
            <span
              className={joinClasses('tournamentProgressValue', progressValueVisible && 'tournamentProgressValue-visible')}
              style={{ transition: progressValueTransition }}
              title={props.variant === 'list' ? registeredLabel : undefined}
              aria-hidden
            >
              {props.variant === 'list' ? <ImageOutlinedIcon fontSize="inherit" /> : null}
              {progressValueText}
            </span>
          </div>
        ) : null}
        {showDetailLink ? (
          <div className="cardNavigationHint">
            <span className="cardNavigationHintLabel">{t('home.action.view_detail')}</span>
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
      <Tooltip describeChild disableHoverListener title={
        <span>{showPublicationStatus ? <>{publicationLabel}<br /></> : null}{registeredLabel}</span>
      }>
        <button type="button" className={rootClassName} onClick={props.onOpenDetail} aria-describedby={progressDescriptionId}>
          {content}
          <span id={progressDescriptionId} hidden>
            {t('home.progress.description', {
              registered: submittedCount,
              total: totalCount,
              shared: safeSharedCount,
              unshared: safeUnsharedCount,
              unregistered: safeUnregisteredCount,
            })}
          </span>
        </button>
      </Tooltip>
    );
  }

  return <section className={rootClassName}>{content}</section>;
}
