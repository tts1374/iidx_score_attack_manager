import { describe, expect, it } from 'vitest';

import {
  buildCreateTournamentInput,
  createEmptyChartDraft,
  createInitialTournamentDraft,
  normalizeHashtagForDisplay,
  resolveCreateTournamentValidation,
  resolveSelectedChartOption,
  type CreateTournamentDraft,
} from './create-tournament-draft';

function buildValidDraft(): CreateTournamentDraft {
  const row1 = {
    ...createEmptyChartDraft(),
    key: 'row-1',
    selectedChartId: 1001,
    chartOptions: [
      {
        chartId: 1001,
        musicId: 2001,
        playStyle: 'SP',
        difficulty: 'HYPER',
        level: '10',
        isActive: 1,
      },
    ],
  };
  const row2 = {
    ...createEmptyChartDraft(),
    key: 'row-2',
    selectedChartId: 1002,
    chartOptions: [
      {
        chartId: 1002,
        musicId: 2002,
        playStyle: 'DP',
        difficulty: 'ANOTHER',
        level: '12',
        isActive: 1,
      },
    ],
  };
  return {
    name: '  Test Tournament  ',
    owner: '  Organizer  ',
    hashtag: '  hash_tag  ',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    rows: [row1, row2],
  };
}

describe('create tournament draft helpers', () => {
  it('creates initial draft with one row', () => {
    const draft = createInitialTournamentDraft('2026-02-18');
    expect(draft.startDate).toBe('2026-02-18');
    expect(draft.endDate).toBe('2026-02-18');
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]?.playStyle).toBe('SP');
  });

  it('validates draft and detects duplicates', () => {
    const draft = buildValidDraft();
    const valid = resolveCreateTournamentValidation(draft);
    expect(valid.canProceed).toBe(true);
    expect(valid.selectedChartIds).toEqual([1001, 1002]);

    const duplicated = {
      ...draft,
      rows: draft.rows.map((row) => ({ ...row, selectedChartId: 1001 })),
    };
    const invalid = resolveCreateTournamentValidation(duplicated);
    expect(invalid.canProceed).toBe(false);
    expect(invalid.duplicateChartIds.has(1001)).toBe(true);
  });

  it('builds db input with trimmed text values', () => {
    const draft = buildValidDraft();
    const validation = resolveCreateTournamentValidation(draft);
    const input = buildCreateTournamentInput(draft, validation.selectedChartIds);
    expect(input).toEqual({
      tournamentName: 'Test Tournament',
      owner: 'Organizer',
      hashtag: 'hash_tag',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      chartIds: [1001, 1002],
    });
  });

  it('formats hashtag and resolves selected chart', () => {
    expect(normalizeHashtagForDisplay('abc')).toBe('#abc');
    expect(normalizeHashtagForDisplay('#abc')).toBe('#abc');
    expect(normalizeHashtagForDisplay('###abc')).toBe('#abc');
    expect(normalizeHashtagForDisplay('')).toBe('');

    const row = buildValidDraft().rows[0]!;
    const selected = resolveSelectedChartOption(row);
    expect(selected?.chartId).toBe(1001);
  });
});
