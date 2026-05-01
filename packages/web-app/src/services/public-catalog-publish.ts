import type { AppDatabase, CreateTournamentInput, TournamentDetailItem } from '@iidx/db';
import { PAYLOAD_VERSION, normalizeTournamentPayload, type TournamentPayload } from '@iidx/shared';

import type { PublicCatalogClient } from './public-catalog-client';

export interface PublishTournamentDefinitionResult {
  status: 'disabled' | 'duplicate' | 'published' | 'retryable';
  publicId?: string;
  error?: unknown;
}

type PublishableTournamentFields = Pick<
  CreateTournamentInput,
  'chartIds' | 'endDate' | 'hashtag' | 'owner' | 'startDate' | 'tournamentName'
>;

export function buildPublicTournamentPayload(
  tournamentUuid: string,
  input: PublishableTournamentFields,
): TournamentPayload {
  return normalizeTournamentPayload({
    v: PAYLOAD_VERSION,
    uuid: tournamentUuid,
    name: input.tournamentName,
    owner: input.owner,
    hashtag: input.hashtag,
    start: input.startDate,
    end: input.endDate,
    charts: input.chartIds,
  });
}

export function buildPublicTournamentPayloadFromDetail(detail: TournamentDetailItem): TournamentPayload {
  return buildPublicTournamentPayload(detail.tournamentUuid, {
    tournamentName: detail.tournamentName,
    owner: detail.owner,
    hashtag: detail.hashtag,
    startDate: detail.startDate,
    endDate: detail.endDate,
    chartIds: detail.charts.map((chart) => chart.chartId),
  });
}

export async function publishTournamentDefinition(
  options: {
    appDb: Pick<AppDatabase, 'markTournamentPublishing' | 'markTournamentPublished' | 'markTournamentPublishRetryable'>;
    publicCatalogClient: PublicCatalogClient;
    tournamentUuid: string;
    payload: TournamentPayload;
    setPublishing?: boolean;
  },
): Promise<PublishTournamentDefinitionResult> {
  const { appDb, payload, publicCatalogClient, setPublishing, tournamentUuid } = options;
  if (!publicCatalogClient.isAvailable()) {
    return { status: 'disabled' };
  }

  if (setPublishing) {
    await appDb.markTournamentPublishing(tournamentUuid);
  }

  try {
    const response = await publicCatalogClient.registerTournament(payload);
    await appDb.markTournamentPublished(tournamentUuid, response.publicId, response.deleteToken);
    return {
      status: response.status === 'duplicate' ? 'duplicate' : 'published',
      publicId: response.publicId,
    };
  } catch (error) {
    await appDb.markTournamentPublishRetryable(tournamentUuid);
    return {
      status: 'retryable',
      error,
    };
  }
}
