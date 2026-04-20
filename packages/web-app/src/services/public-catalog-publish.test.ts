import { describe, expect, it, vi } from 'vitest';

import {
  buildPublicTournamentPayload,
  buildPublicTournamentPayloadFromDetail,
  publishTournamentDefinition,
} from './public-catalog-publish';

describe('public catalog publish helpers', () => {
  it('marks tournament as published after a successful register call', async () => {
    const appDb = {
      markTournamentPublishing: vi.fn(),
      markTournamentPublished: vi.fn(),
      markTournamentPublishRetryable: vi.fn(),
    };
    const publicCatalogClient = {
      isAvailable: () => true,
      registerTournament: vi.fn().mockResolvedValue({ status: 'created', publicId: 'public-123' }),
    };

    const result = await publishTournamentDefinition({
      appDb,
      publicCatalogClient,
      tournamentUuid: '11111111-1111-4111-8111-111111111111',
      payload: buildPublicTournamentPayload('11111111-1111-4111-8111-111111111111', {
        tournamentName: '公開テスト',
        owner: '',
        hashtag: 'PUBLIC',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        chartIds: [10, 20],
      }),
    });

    expect(result).toEqual({
      status: 'published',
      publicId: 'public-123',
    });
    expect(appDb.markTournamentPublished).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'public-123');
    expect(appDb.markTournamentPublishRetryable).not.toHaveBeenCalled();
  });

  it('keeps retryable state when publish registration fails', async () => {
    const error = new Error('network failed');
    const appDb = {
      markTournamentPublishing: vi.fn(),
      markTournamentPublished: vi.fn(),
      markTournamentPublishRetryable: vi.fn(),
    };
    const publicCatalogClient = {
      isAvailable: () => true,
      registerTournament: vi.fn().mockRejectedValue(error),
    };

    const result = await publishTournamentDefinition({
      appDb,
      publicCatalogClient,
      tournamentUuid: '22222222-2222-4222-8222-222222222222',
      payload: buildPublicTournamentPayloadFromDetail({
        tournamentUuid: '22222222-2222-4222-8222-222222222222',
        sourceTournamentUuid: null,
        defHash: 'def',
        tournamentName: '失敗テスト',
        owner: '',
        hashtag: 'RETRY',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        isImported: false,
        chartCount: 1,
        submittedCount: 0,
        sendWaitingCount: 0,
        pendingCount: 1,
        lastSubmittedAt: null,
        charts: [
          {
            chartId: 999,
            title: 'Song',
            playStyle: 'SP',
            difficulty: 'HYPER',
            level: '10',
            resolveIssue: null,
            submitted: false,
            updateSeq: 0,
            needsSend: false,
            fileDeleted: false,
          },
        ],
      }),
      setPublishing: true,
    });

    expect(result).toEqual({
      status: 'retryable',
      error,
    });
    expect(appDb.markTournamentPublishing).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(appDb.markTournamentPublishRetryable).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(appDb.markTournamentPublished).not.toHaveBeenCalled();
  });
});
