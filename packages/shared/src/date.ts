export type TournamentStatus = 'upcoming' | 'active' | 'ended';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(date: string, name: string): void {
  if (!ISO_DATE_RE.test(date)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
}

function toUtcDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function getTournamentStatus(
  startDate: string,
  endDate: string,
  todayDate: string,
): TournamentStatus {
  assertIsoDate(startDate, 'startDate');
  assertIsoDate(endDate, 'endDate');
  assertIsoDate(todayDate, 'todayDate');

  if (todayDate < startDate) {
    return 'upcoming';
  }
  if (todayDate > endDate) {
    return 'ended';
  }
  return 'active';
}

export function remainingDaysUntilEnd(endDate: string, todayDate: string): number {
  assertIsoDate(endDate, 'endDate');
  assertIsoDate(todayDate, 'todayDate');
  const diff = toUtcDateOnly(endDate).getTime() - toUtcDateOnly(todayDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function daysUntilStart(startDate: string, todayDate: string): number {
  assertIsoDate(startDate, 'startDate');
  assertIsoDate(todayDate, 'todayDate');
  const diff = toUtcDateOnly(startDate).getTime() - toUtcDateOnly(todayDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
