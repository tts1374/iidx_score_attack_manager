import React from 'react';
import { useTheme } from '@mui/material/styles';
import type { TournamentListItem, TournamentTab } from '@iidx/db';
import { useTranslation } from 'react-i18next';

import { TournamentSummaryCard } from '../components/TournamentSummaryCard';

const HOME_CARD_ENTER_EXIT_DURATION_MS = 200;
const HOME_CARD_FLIP_DURATION_MS = 200;

export type HomeListAnimationMode = 'filter' | 'sort';

interface HomePageProps {
  todayDate: string;
  state: TournamentTab;
  items: TournamentListItem[];
  onOpenDetail: (tournamentUuid: string) => void;
  onOpenFilterInEmpty?: () => void;
  prefersReducedMotion?: boolean;
  animationMode?: HomeListAnimationMode;
}

interface ProgressDistribution {
  sharedCount: number;
  sendWaitingCount: number;
  unregisteredCount: number;
}

type HomeCardAnimationPhase = 'entering' | 'stable' | 'exiting';

interface HomeCardEntry {
  key: string;
  item: TournamentListItem;
  phase: HomeCardAnimationPhase;
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

function createStableCardEntries(items: TournamentListItem[]): HomeCardEntry[] {
  return items.map((item) => ({
    key: item.tournamentUuid,
    item,
    phase: 'stable',
  }));
}

function mergeCardEntries(previous: HomeCardEntry[], nextItems: TournamentListItem[]): HomeCardEntry[] {
  const nextIds = new Set(nextItems.map((item) => item.tournamentUuid));
  const previousById = new Map(previous.map((entry) => [entry.key, entry] as const));
  const previousIndexById = new Map(previous.map((entry, index) => [entry.key, index] as const));
  const nextEntries: HomeCardEntry[] = nextItems.map((item) => {
    const existing = previousById.get(item.tournamentUuid);
    if (!existing) {
      return {
        key: item.tournamentUuid,
        item,
        phase: 'entering',
      };
    }
    return {
      key: existing.key,
      item,
      phase: existing.phase === 'exiting' ? 'stable' : existing.phase,
    };
  });
  const exitingEntries = previous
    .filter((entry) => !nextIds.has(entry.key))
    .map((entry) =>
      entry.phase === 'exiting'
        ? entry
        : {
            ...entry,
            phase: 'exiting' as const,
          },
    );
  if (exitingEntries.length === 0) {
    return nextEntries;
  }
  const merged = [...nextEntries];
  const sortedExiting = [...exitingEntries].sort(
    (a, b) => (previousIndexById.get(a.key) ?? 0) - (previousIndexById.get(b.key) ?? 0),
  );
  let insertedCount = 0;
  for (const exiting of sortedExiting) {
    const previousIndex = previousIndexById.get(exiting.key) ?? merged.length;
    const insertIndex = Math.max(0, Math.min(merged.length, previousIndex + insertedCount));
    merged.splice(insertIndex, 0, exiting);
    insertedCount += 1;
  }
  return merged;
}

export function HomePage(props: HomePageProps): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const prefersReducedMotion = props.prefersReducedMotion ?? false;
  const animationMode = props.animationMode ?? 'filter';
  const flipEnabled = !prefersReducedMotion && animationMode === 'sort';
  const cardEnterExitDuration = prefersReducedMotion ? 0 : HOME_CARD_ENTER_EXIT_DURATION_MS;
  const cardEnterExitTransition = React.useMemo(
    () =>
      theme.transitions.create('opacity', {
        duration: cardEnterExitDuration,
        easing: theme.transitions.easing.easeOut,
      }),
    [cardEnterExitDuration, theme],
  );
  const cardFlipTransition = React.useMemo(
    () =>
      theme.transitions.create('transform', {
        duration: prefersReducedMotion ? 0 : HOME_CARD_FLIP_DURATION_MS,
        easing: theme.transitions.easing.easeOut,
      }),
    [prefersReducedMotion, theme],
  );
  const [cardEntries, setCardEntries] = React.useState<HomeCardEntry[]>(() => createStableCardEntries(props.items));
  const cardItemRefs = React.useRef<Map<string, HTMLLIElement>>(new Map());
  const previousRectsRef = React.useRef<Map<string, DOMRect>>(new Map());
  const exitTimersRef = React.useRef<Map<string, number>>(new Map());
  const enterFrameRef = React.useRef<number | null>(null);
  const flipFrameIdsRef = React.useRef<number[]>([]);

  const setCardItemRef = React.useCallback((key: string, node: HTMLLIElement | null) => {
    if (node) {
      cardItemRefs.current.set(key, node);
      return;
    }
    cardItemRefs.current.delete(key);
  }, []);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setCardEntries(createStableCardEntries(props.items));
      return;
    }
    setCardEntries((previous) => mergeCardEntries(previous, props.items));
  }, [prefersReducedMotion, props.items]);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    if (!cardEntries.some((entry) => entry.phase === 'entering')) {
      return;
    }
    if (enterFrameRef.current !== null) {
      window.cancelAnimationFrame(enterFrameRef.current);
    }
    enterFrameRef.current = window.requestAnimationFrame(() => {
      setCardEntries((current) =>
        current.map((entry) =>
          entry.phase === 'entering'
            ? {
                ...entry,
                phase: 'stable',
              }
            : entry,
        ),
      );
      enterFrameRef.current = null;
    });
    return () => {
      if (enterFrameRef.current !== null) {
        window.cancelAnimationFrame(enterFrameRef.current);
        enterFrameRef.current = null;
      }
    };
  }, [cardEntries, prefersReducedMotion]);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      exitTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      exitTimersRef.current.clear();
      previousRectsRef.current.clear();
    }
  }, [prefersReducedMotion]);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }
    const exitingKeys = new Set(cardEntries.filter((entry) => entry.phase === 'exiting').map((entry) => entry.key));
    exitTimersRef.current.forEach((timerId, key) => {
      if (!exitingKeys.has(key)) {
        window.clearTimeout(timerId);
        exitTimersRef.current.delete(key);
      }
    });
    for (const key of exitingKeys) {
      if (exitTimersRef.current.has(key)) {
        continue;
      }
      const timerId = window.setTimeout(() => {
        exitTimersRef.current.delete(key);
        setCardEntries((current) => current.filter((entry) => entry.key !== key));
      }, HOME_CARD_ENTER_EXIT_DURATION_MS);
      exitTimersRef.current.set(key, timerId);
    }
  }, [cardEntries, prefersReducedMotion]);

  React.useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>();
    cardItemRefs.current.forEach((node, key) => {
      nextRects.set(key, node.getBoundingClientRect());
    });
    if (flipEnabled) {
      for (const frameId of flipFrameIdsRef.current) {
        window.cancelAnimationFrame(frameId);
      }
      flipFrameIdsRef.current = [];
      const stableKeys = new Set(cardEntries.filter((entry) => entry.phase === 'stable').map((entry) => entry.key));
      nextRects.forEach((nextRect, key) => {
        if (!stableKeys.has(key)) {
          return;
        }
        const previousRect = previousRectsRef.current.get(key);
        if (!previousRect) {
          return;
        }
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
          return;
        }
        const node = cardItemRefs.current.get(key);
        if (!node) {
          return;
        }
        node.style.transition = 'none';
        node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        const frameId = window.requestAnimationFrame(() => {
          node.style.transition = cardFlipTransition;
          node.style.transform = '';
        });
        flipFrameIdsRef.current.push(frameId);
      });
    }
    previousRectsRef.current = nextRects;
  }, [cardEntries, cardFlipTransition, flipEnabled]);

  React.useEffect(
    () => () => {
      if (enterFrameRef.current !== null) {
        window.cancelAnimationFrame(enterFrameRef.current);
        enterFrameRef.current = null;
      }
      for (const frameId of flipFrameIdsRef.current) {
        window.cancelAnimationFrame(frameId);
      }
      flipFrameIdsRef.current = [];
      exitTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      exitTimersRef.current.clear();
    },
    [],
  );

  return (
    <div className="page tournamentListPage">
      {cardEntries.length === 0 ? (
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
          {cardEntries.map((entry) => {
            const progress = resolveProgressDistribution(entry.item);

            return (
              <li key={entry.key} className="homeCardListItem" ref={(node) => setCardItemRef(entry.key, node)}>
                <div
                  className={`homeCardPresence homeCardPresence-${entry.phase}`}
                  style={{
                    transition: cardEnterExitTransition,
                  }}
                >
                  <div className="homeCardPresenceContent">
                    <TournamentSummaryCard
                      variant="list"
                      title={entry.item.tournamentName}
                      startDate={entry.item.startDate}
                      endDate={entry.item.endDate}
                      todayDate={props.todayDate}
                      sharedCount={progress.sharedCount}
                      unsharedCount={progress.sendWaitingCount}
                      unregisteredCount={progress.unregisteredCount}
                      showPublicationStatus={!entry.item.isImported}
                      {...(entry.item.publicStatus ? { publicationStatus: entry.item.publicStatus } : {})}
                      prefersReducedMotion={prefersReducedMotion}
                      onOpenDetail={() => props.onOpenDetail(entry.item.tournamentUuid)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

