import { describe, expect, it } from 'vitest';
import { getSubmissionState, buildEvidenceFileName, sha256Text, validateTournamentInput } from '../src/index.js';

describe('misc utilities', () => {
  it('submission state', () => {
    expect(getSubmissionState(0, false)).toBe('unsubmitted');
    expect(getSubmissionState(1, false)).toBe('submitted');
    expect(getSubmissionState(2, false)).toBe('updated');
    expect(getSubmissionState(3, true)).toBe('unsubmitted');
  });

  it('builds evidence file name', () => {
    expect(buildEvidenceFileName('abc', 100)).toBe('abc_100.jpg');
  });

  it('sha256 hash', () => {
    expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('validates tournament input', () => {
    const errors = validateTournamentInput(
      {
        tournamentName: ' ',
        owner: 'owner',
        hashtag: 'hash',
        startDate: '2026-02-02',
        endDate: '2026-02-01',
        chartIds: [1, 1],
      },
      '2026-01-01',
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
