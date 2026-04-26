import { describe, expect, it, vi } from 'vitest';

import { deleteRemotePublicTournamentBestEffort } from './App';
import type { PublicCatalogClient } from './services/public-catalog-client';

function createPublicCatalogClientMock(
  deletePublicTournament: () => Promise<void>,
): Pick<PublicCatalogClient, 'isAvailable' | 'deletePublicTournament'> {
  return {
    isAvailable: vi.fn(() => true),
    deletePublicTournament: vi.fn(deletePublicTournament),
  };
}

describe('deleteRemotePublicTournamentBestEffort', () => {
  it('deletes the remote public tournament when metadata is available', async () => {
    const client = createPublicCatalogClientMock(async () => undefined);

    await deleteRemotePublicTournamentBestEffort(client, {
      publicId: 'public-1',
      publicDeleteToken: 'delete-token-1',
    });

    expect(client.deletePublicTournament).toHaveBeenCalledWith('public-1', 'delete-token-1');
  });

  it('does not throw when remote deletion fails', async () => {
    const client = createPublicCatalogClientMock(async () => {
      throw new Error('remote delete failed');
    });

    await expect(
      deleteRemotePublicTournamentBestEffort(client, {
        publicId: 'public-1',
        publicDeleteToken: 'delete-token-1',
      }),
    ).resolves.toBeUndefined();
    expect(client.deletePublicTournament).toHaveBeenCalledWith('public-1', 'delete-token-1');
  });
});
