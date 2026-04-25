import { describe, expect, it } from 'vitest';
import {
  buildPublicTournamentRegistryHash,
  buildTournamentDefHash,
  canonicalPublicTournamentRegistryPayload,
  countPublicTournamentChartStyles,
} from '../src/index.js';

const basePayload = {
  v: 1,
  uuid: '9f5fb95d-0f2a-4270-81c9-a7f4b58f32af',
  name: 'PUBLIC TOURNAMENT',
  owner: 'owner',
  hashtag: 'iidx',
  start: '2026-02-01',
  end: '2026-02-28',
  charts: [300, 100],
};

describe('public catalog helpers', () => {
  it('builds registry hash without uuid influence', () => {
    const a = buildPublicTournamentRegistryHash(basePayload);
    const b = buildPublicTournamentRegistryHash({
      ...basePayload,
      uuid: '11111111-1111-4111-8111-111111111111',
    });

    expect(a).toBe(b);
  });

  it('sorts charts for registry hash canonicalization', () => {
    const a = buildPublicTournamentRegistryHash(basePayload);
    const b = buildPublicTournamentRegistryHash({
      ...basePayload,
      charts: [100, 300],
    });

    expect(a).toBe(b);
  });

  it('keeps def hash behavior unchanged', () => {
    const a = buildTournamentDefHash(basePayload);
    const b = buildTournamentDefHash({
      ...basePayload,
      uuid: '11111111-1111-4111-8111-111111111111',
    });

    expect(a).not.toBe(b);
  });

  it('excludes payload version and uuid from canonical registry payload', () => {
    expect(canonicalPublicTournamentRegistryPayload(basePayload)).toEqual({
      name: 'PUBLIC TOURNAMENT',
      owner: 'owner',
      hashtag: 'iidx',
      start: '2026-02-01',
      end: '2026-02-28',
      charts: [100, 300],
    });
  });

  it('counts SP and DP charts from song master chart ids', () => {
    expect(countPublicTournamentChartStyles([1, 5, 6, 9, 10, 14, 15])).toEqual({
      spChartCount: 4,
      dpChartCount: 3,
    });
  });

  it('ignores invalid chart ids when counting chart styles', () => {
    expect(countPublicTournamentChartStyles([0, -1, 1.5, Number.NaN, 6])).toEqual({
      spChartCount: 0,
      dpChartCount: 1,
    });
  });
});
