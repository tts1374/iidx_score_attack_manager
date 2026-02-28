import { remainingDaysUntilEnd } from '@iidx/shared';
import i18n from '../i18n';

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
      label: i18n.t('tournament_detail.status.upcoming'),
      daysLeft: null,
    };
  }

  if (todayDate > endDate) {
    return {
      status: 'ended',
      label: i18n.t('tournament_detail.status.ended'),
      daysLeft: null,
    };
  }

  const daysLeft = remainingDaysUntilEnd(endDate, todayDate);
  if (daysLeft === 0) {
    return {
      status: 'active-today',
      label: i18n.t('tournament_detail.status.active_today'),
      daysLeft,
    };
  }
  if (daysLeft <= 2) {
    return {
      status: 'active-danger',
      label: i18n.t('tournament_detail.status.active_remaining_days', { count: daysLeft }),
      daysLeft,
    };
  }
  if (daysLeft <= 7) {
    return {
      status: 'active-warning',
      label: i18n.t('tournament_detail.status.active_remaining_days', { count: daysLeft }),
      daysLeft,
    };
  }
  return {
    status: 'active-normal',
    label: i18n.t('tournament_detail.status.active_remaining_days', { count: daysLeft }),
    daysLeft,
  };
}
