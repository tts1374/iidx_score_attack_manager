import { describe, expect, it } from 'vitest';
import { getTournamentStatus, remainingDaysUntilEnd, daysUntilStart } from '../src/index.js';

describe('date status', () => {
  it('returns active within range', () => {
    expect(getTournamentStatus('2026-02-01', '2026-02-10', '2026-02-05')).toBe('active');
  });

  it('returns upcoming before start', () => {
    expect(getTournamentStatus('2026-02-01', '2026-02-10', '2026-01-31')).toBe('upcoming');
  });

  it('returns ended after end', () => {
    expect(getTournamentStatus('2026-02-01', '2026-02-10', '2026-02-11')).toBe('ended');
  });

  it('calculates day offsets', () => {
    expect(remainingDaysUntilEnd('2026-02-10', '2026-02-07')).toBe(3);
    expect(daysUntilStart('2026-02-10', '2026-02-07')).toBe(3);
  });
});
