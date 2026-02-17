import { describe, expect, it } from 'vitest';

import { resolveTournamentCardStatus } from './tournament-status';

describe('resolveTournamentCardStatus', () => {
  it('returns upcoming before start date', () => {
    expect(resolveTournamentCardStatus('2026-02-20', '2026-02-25', '2026-02-19').status).toBe('upcoming');
  });

  it('returns ended after end date', () => {
    expect(resolveTournamentCardStatus('2026-02-01', '2026-02-10', '2026-02-11').status).toBe('ended');
  });

  it('returns active-today on end date', () => {
    const result = resolveTournamentCardStatus('2026-02-01', '2026-02-10', '2026-02-10');
    expect(result.status).toBe('active-today');
    expect(result.label).toBe('今日まで');
  });

  it('returns active-danger for 1-3 days left', () => {
    const result = resolveTournamentCardStatus('2026-02-01', '2026-02-10', '2026-02-08');
    expect(result.status).toBe('active-danger');
    expect(result.label).toBe('残り2日');
  });

  it('returns active-warning for 4-7 days left', () => {
    const result = resolveTournamentCardStatus('2026-02-01', '2026-02-10', '2026-02-05');
    expect(result.status).toBe('active-warning');
    expect(result.label).toBe('残り5日');
  });

  it('returns active-normal for more than 7 days left', () => {
    const result = resolveTournamentCardStatus('2026-02-01', '2026-02-20', '2026-02-01');
    expect(result.status).toBe('active-normal');
    expect(result.label).toBe('残り19日');
  });
});

