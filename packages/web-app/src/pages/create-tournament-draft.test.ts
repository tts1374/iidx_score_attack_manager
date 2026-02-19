import { describe, expect, it } from 'vitest';

import {
  buildCreateTournamentInput,
  createEmptyChartDraft,
  createInitialTournamentDraft,
  formatIsoDate,
  normalizeHashtagForDisplay,
  parseIsoDate,
  resolveCreateTournamentValidation,
  resolveNextMonthDateRange,
  resolveRangeDayCount,
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
    tournamentUuid: 'd57d0df0-9a1c-4c5f-a1a2-90f4d183edc1',
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
    expect(draft.tournamentUuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(draft.tournamentUuid).toHaveLength(36);
    expect(draft.startDate).toBe('2026-02-18');
    expect(draft.endDate).toBe('2026-02-18');
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]?.playStyle).toBe('SP');
  });

  it('validates draft and detects duplicates', () => {
    const draft = buildValidDraft();
    const valid = resolveCreateTournamentValidation(draft, '2026-02-15');
    expect(valid.canProceed).toBe(true);
    expect(valid.selectedChartIds).toEqual([1001, 1002]);

    const duplicated = {
      ...draft,
      rows: draft.rows.map((row) => ({ ...row, selectedChartId: 1001 })),
    };
    const invalid = resolveCreateTournamentValidation(duplicated, '2026-02-15');
    expect(invalid.canProceed).toBe(false);
    expect(invalid.duplicateChartIds.has(1001)).toBe(true);
  });

  it('builds db input with trimmed text values', () => {
    const draft = buildValidDraft();
    const validation = resolveCreateTournamentValidation(draft, '2026-02-15');
    const input = buildCreateTournamentInput(draft, validation.selectedChartIds);
    expect(input).toEqual({
      tournamentUuid: 'd57d0df0-9a1c-4c5f-a1a2-90f4d183edc1',
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

  it('rejects period when end date is before today', () => {
    const draft = {
      ...buildValidDraft(),
      startDate: '2026-01-01',
      endDate: '2026-02-14',
    };
    const validation = resolveCreateTournamentValidation(draft, '2026-02-15');
    expect(validation.periodError).toBe('終了日には今日以降の日付を指定してください。');
    expect(validation.canProceed).toBe(false);
  });

  it('resolves next month range and day count', () => {
    const nextMonth = resolveNextMonthDateRange('2026-02-19');
    expect(nextMonth).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    expect(resolveRangeDayCount('2026-02-19', '2026-03-15')).toBe(25);
    expect(resolveRangeDayCount('2026-02-19', '2026-02-19')).toBe(1);

    const parsed = parseIsoDate('2026-03-15');
    expect(parsed).not.toBeNull();
    expect(formatIsoDate(parsed!)).toBe('2026-03-15');
  });
});
