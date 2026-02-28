import { describe, expect, it } from 'vitest';
import {
  getSubmissionState,
  buildEvidenceFileName,
  formatHashtagForDisplay,
  normalizeSearchText,
  normalizeHashtag,
  sha256Text,
  validateTournamentInput,
} from '../src/index.js';

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

  it('normalizes hashtag with japanese input', () => {
    expect(normalizeHashtag('#IIDX')).toBe('IIDX');
    expect(normalizeHashtag('＃スコアタ')).toBe('スコアタ');
    expect(normalizeHashtag('###大会2026')).toBe('大会2026');
    expect(normalizeHashtag('  全角 スペース  ')).toBe('全角スペース');
    expect(formatHashtagForDisplay('###大会 2026')).toBe('#大会2026');
  });

  it('requires non-empty hashtag after normalization', () => {
    const errors = validateTournamentInput(
      {
        tournamentName: '大会',
        owner: '開催者',
        hashtag: '  ###  ',
        startDate: '2026-02-01',
        endDate: '2026-02-02',
        chartIds: [1],
      },
      '2026-01-01',
    );
    expect(errors).toContainEqual({ code: 'TOURNAMENT_HASHTAG_REQUIRED' });
  });

  it('normalizes search text with replacement table', () => {
    expect(normalizeSearchText('  Geirskögul  ')).toBe('geirskogul');
    expect(normalizeSearchText('Präludium')).toBe('praludium');
    expect(normalizeSearchText('straße')).toBe('strasse');
    expect(normalizeSearchText('  Café   au   lait  ')).toBe('cafe au lait');
  });
});
