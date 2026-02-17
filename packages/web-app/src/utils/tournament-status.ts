import { remainingDaysUntilEnd } from '@iidx/shared';

export type TournamentStatus =
  | 'upcoming'
  | 'active-normal'
  | 'active-warning'
  | 'active-danger'
  | 'active-today'
  | 'ended';

export interface TournamentStatusBadge {
  status: TournamentStatus;
  label: string;
  daysLeft: number | null;
}

export function resolveTournamentCardStatus(
  startDate: string,
  endDate: string,
  todayDate: string,
): TournamentStatusBadge {
  if (todayDate < startDate) {
    return {
      status: 'upcoming',
      label: '未開催',
      daysLeft: null,
    };
  }

  if (todayDate > endDate) {
    return {
      status: 'ended',
      label: '終了',
      daysLeft: null,
    };
  }

  const daysLeft = remainingDaysUntilEnd(endDate, todayDate);
  if (daysLeft === 0) {
    return {
      status: 'active-today',
      label: '今日まで',
      daysLeft,
    };
  }
  if (daysLeft <= 3) {
    return {
      status: 'active-danger',
      label: `残り${daysLeft}日`,
      daysLeft,
    };
  }
  if (daysLeft <= 7) {
    return {
      status: 'active-warning',
      label: `残り${daysLeft}日`,
      daysLeft,
    };
  }
  return {
    status: 'active-normal',
    label: `残り${daysLeft}日`,
    daysLeft,
  };
}

