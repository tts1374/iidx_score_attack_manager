import React from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslation } from 'react-i18next';

export type ChartCardStatus = 'unregistered' | 'unshared' | 'shared';
type ChartCardVariant = 'submit' | 'detail' | 'preview';
type DifficultyTone = 'beginner' | 'normal' | 'hyper' | 'another' | 'leggendaria' | 'unknown';

interface ChartCardProps {
  title: string;
  playStyle: string;
  difficulty: string;
  level: string;
  status?: ChartCardStatus | undefined;
  actions?: React.ReactNode | undefined;
  note?: string | null | undefined;
  noteClassName?: string | undefined;
  className?: string | undefined;
  titleClassName?: string | undefined;
  playStyleClassName?: string | undefined;
  difficultyLevelClassName?: string | undefined;
  statusTestId?: string | undefined;
  metaTestId?: string | undefined;
  variant?: ChartCardVariant | undefined;
}

function joinClasses(...values: Array<string | undefined | null | false>): string {
  return values.filter(Boolean).join(' ');
}

function resolveDifficultyTone(difficulty: string): DifficultyTone {
  const normalized = String(difficulty ?? '').trim().toUpperCase();
  if (normalized === 'BEGINNER') {
    return 'beginner';
  }
  if (normalized === 'NORMAL') {
    return 'normal';
  }
  if (normalized === 'HYPER') {
    return 'hyper';
  }
  if (normalized === 'ANOTHER') {
    return 'another';
  }
  if (normalized === 'LEGGENDARIA') {
    return 'leggendaria';
  }
  return 'unknown';
}

function resolveBadgeStatus(status: ChartCardStatus | undefined): Extract<ChartCardStatus, 'unregistered' | 'unshared'> | undefined {
  if (status === 'unregistered') {
    return 'unregistered';
  }
  if (status === 'unshared') {
    return 'unshared';
  }
  return undefined;
}

export function ChartCard(props: ChartCardProps): JSX.Element {
  const { t } = useTranslation();
  const variant: ChartCardVariant = props.variant ?? 'detail';
  const isMobileViewport = useMediaQuery('(max-width:599px)');
  const badgeStatus = resolveBadgeStatus(props.status);
  const difficultyTone = resolveDifficultyTone(props.difficulty);
  const difficultyLevelText = `${String(props.difficulty ?? '').trim()} ${String(props.level ?? '').trim()}`.trim();
  const submitMetaRef = React.useRef<HTMLDivElement | null>(null);
  const [hideSubmitBadge, setHideSubmitBadge] = React.useState(false);

  React.useEffect(() => {
    if (variant !== 'submit' || !badgeStatus) {
      setHideSubmitBadge(false);
      return;
    }
    const target = submitMetaRef.current;
    if (!target) {
      return;
    }

    const threshold = 340;
    const updateHidden = () => {
      setHideSubmitBadge(target.clientWidth < threshold);
    };
    updateHidden();

    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', updateHidden);
      return () => {
        window.removeEventListener('resize', updateHidden);
      };
    }

    const observer = new ResizeObserver(() => {
      updateHidden();
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [badgeStatus, variant]);

  const showSubmitMetaStatus = variant === 'submit' && badgeStatus !== undefined && !hideSubmitBadge;
  const showLeftStatus = variant === 'detail' && badgeStatus !== undefined;
  const hasActions = props.actions !== null && props.actions !== undefined;
  const useDetailMobileLayout = variant === 'detail' && isMobileViewport;
  const showInlineDetailAction = useDetailMobileLayout && hasActions;
  const hasRight = (hasActions || variant === 'detail') && !useDetailMobileLayout;
  const rootClassName = joinClasses('chartListItem', `chartListItem-${variant}`, !hasRight && 'chartListItem-noRight', props.className);
  const titleClassName = joinClasses('chartTitle', props.titleClassName);
  const playStyleClassName = joinClasses('chartPlayStyleText', props.playStyleClassName);
  const difficultyLevelClassName = joinClasses(
    'chartDifficultyLevelText',
    `chart-diff--${difficultyTone}`,
    props.difficultyLevelClassName,
  );
  const rightClassName = joinClasses(
    'chartActions',
    hasActions && 'chartActions-withActions',
    `chartActions-${variant}`,
  );

  return (
    <div className={rootClassName}>
      <div className="chartText">
        <strong className={titleClassName}>{props.title}</strong>
        <div
          className={joinClasses('chartMetaLine', variant === 'submit' && 'chartMetaLine-submit')}
          data-testid={props.metaTestId}
          ref={variant === 'submit' ? submitMetaRef : undefined}
        >
          <span className={playStyleClassName}>{props.playStyle}</span>
          <span className={difficultyLevelClassName}>
            {difficultyLevelText}
          </span>
          {showSubmitMetaStatus ? (
            <span
              className={`chartStateBadge chartStateBadge-${badgeStatus} chartMetaStatusBadge`}
              data-testid={props.statusTestId}
              data-chart-state={badgeStatus}
            >
              {t(`tournament_detail.chart.status.${badgeStatus}`)}
            </span>
          ) : null}
        </div>
        {variant === 'detail' ? (
          <div className={joinClasses('chartLeftStatusRow', showInlineDetailAction && 'chartLeftStatusRow-mobile')}>
            {showLeftStatus ? (
              <span
                className={`chartStateBadge chartStateBadge-${badgeStatus}`}
                data-testid={props.statusTestId}
                data-chart-state={badgeStatus}
              >
                {t(`tournament_detail.chart.status.${badgeStatus}`)}
              </span>
            ) : null}
            {showInlineDetailAction ? <div className="chartInlineActionSlot">{props.actions}</div> : null}
          </div>
        ) : null}
        {props.note ? <p className={props.noteClassName ?? 'chartResolveIssue'}>{props.note}</p> : null}
      </div>
      {hasRight ? (
        <div className={rightClassName}>
          {variant === 'detail' ? (
            <>
              <div className="chartActionSpacer" aria-hidden />
              <div className="chartActionSpacer" aria-hidden />
              <div className="chartActionSlot">{props.actions}</div>
            </>
          ) : (
            props.actions
          )}
        </div>
      ) : null}
    </div>
  );
}
