import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PublicCatalogPage } from './PublicCatalogPage';
import type { PublicCatalogClient } from '../services/public-catalog-client';

afterEach(() => {
  cleanup();
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

function createClientMock(): {
  client: PublicCatalogClient;
  isAvailable: ReturnType<typeof vi.fn>;
  registerTournament: ReturnType<typeof vi.fn>;
  listPublicTournaments: ReturnType<typeof vi.fn>;
  getPublicTournamentPayload: ReturnType<typeof vi.fn>;
} {
  const isAvailable = vi.fn(() => true);
  const registerTournament = vi.fn();
  const listPublicTournaments = vi.fn();
  const getPublicTournamentPayload = vi.fn();

  return {
    client: {
      isAvailable,
      registerTournament,
      listPublicTournaments,
      getPublicTournamentPayload,
    },
    isAvailable,
    registerTournament,
    listPublicTournaments,
    getPublicTournamentPayload,
  };
}

describe('PublicCatalogPage', () => {
  it('shows a loading state, renders list items, and opens import confirm', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{
      items: Array<{
        publicId: string;
        name: string;
        owner: string;
        hashtag: string;
        start: string;
        end: string;
        chartCount: number;
        createdAt: string;
      }>;
      nextCursor: string | null;
    }>();
    const { client, listPublicTournaments, getPublicTournamentPayload } =
      createClientMock();
    const onOpenImportConfirm = vi.fn();

    listPublicTournaments.mockReturnValue(deferred.promise);
    getPublicTournamentPayload.mockResolvedValue({
      payloadParam: 'payload-123',
    });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        onOpenImportConfirm={onOpenImportConfirm}
      />,
    );

    expect(screen.getAllByTestId('public-catalog-skeleton-card')).toHaveLength(3);

    deferred.resolve({
      items: [
        {
          publicId: 'public-1',
          name: 'Alpha Cup',
          owner: 'Alice',
          hashtag: 'IIDX',
          start: '2026-04-01',
          end: '2026-04-07',
          chartCount: 12,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    expect(await screen.findByText('Alpha Cup')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(getPublicTournamentPayload).toHaveBeenCalledWith('public-1');
    });
    expect(onOpenImportConfirm).toHaveBeenCalledWith('payload-123');
    expect(listPublicTournaments).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the list API returns no items', async () => {
    const { client, listPublicTournaments } = createClientMock();

    listPublicTournaments.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(
      await screen.findByText('公開中のスコアタはまだありません。'),
    ).toBeTruthy();
  });

  it('finishes initial loading under React StrictMode', async () => {
    const { client, listPublicTournaments } = createClientMock();

    listPublicTournaments.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    render(
      <React.StrictMode>
        <PublicCatalogPage
          client={client}
          songMasterReady
          onOpenImportConfirm={() => undefined}
        />
      </React.StrictMode>,
    );

    expect(
      await screen.findByText('公開中のスコアタはまだありません。'),
    ).toBeTruthy();
  });

  it('shows an error state and retries the initial load', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments } = createClientMock();

    listPublicTournaments
      .mockRejectedValueOnce(new Error('request failed'))
      .mockResolvedValueOnce({
        items: [],
        nextCursor: null,
      });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(
      await screen.findByText('公開カタログの取得に失敗しました。'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '再読み込み' }));

    expect(
      await screen.findByText('公開中のスコアタはまだありません。'),
    ).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenCalledTimes(2);
  });
});
