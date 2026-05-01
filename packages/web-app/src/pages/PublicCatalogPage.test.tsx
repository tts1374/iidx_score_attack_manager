import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PublicCatalogPage } from './PublicCatalogPage';
import type { PublicCatalogClient } from '../services/public-catalog-client';

type PublicTournamentListResult = Awaited<
  ReturnType<PublicCatalogClient['listPublicTournaments']>
>;

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
  deletePublicTournament: ReturnType<typeof vi.fn>;
} {
  const isAvailable = vi.fn(() => true);
  const registerTournament = vi.fn();
  const listPublicTournaments = vi.fn();
  const getPublicTournamentPayload = vi.fn();
  const deletePublicTournament = vi.fn();

  return {
    client: {
      isAvailable,
      registerTournament,
      listPublicTournaments,
      getPublicTournamentPayload,
      deletePublicTournament,
    },
    isAvailable,
    registerTournament,
    listPublicTournaments,
    getPublicTournamentPayload,
    deletePublicTournament,
  };
}

function createListItem(index: number) {
  return {
    publicId: `public-${index}`,
    name: `Cup ${index}`,
    owner: `Owner ${index}`,
    hashtag: 'IIDX',
    start: '2026-04-01',
    end: '2026-04-07',
    chartCount: 12,
    createdAt: `2026-04-01T00:${String(index).padStart(2, '0')}:00.000Z`,
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
        spChartCount: number;
        dpChartCount: number;
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
          spChartCount: 7,
          dpChartCount: 5,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    expect(await screen.findByText('Alpha Cup')).toBeTruthy();
    expect(screen.getByText('譜面数: 12（SP 7 / DP 5）')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(getPublicTournamentPayload).toHaveBeenCalledWith('public-1');
    });
    expect(onOpenImportConfirm).toHaveBeenCalledWith('payload-123');
    expect(listPublicTournaments).toHaveBeenCalledTimes(1);
  });

  it('shows loaded item count across cursor pagination', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments } = createClientMock();

    listPublicTournaments
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_, index) => createListItem(index + 1)),
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 20 }, (_, index) => createListItem(index + 21)),
        nextCursor: null,
      });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('20件表示中')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '続きを読む' }));

    expect(await screen.findByText('40件表示中')).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenCalledWith({
      query: '',
      cursor: 'cursor-2',
    });
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

  it('clears loading-more state when a new search cancels the request', async () => {
    const user = userEvent.setup();
    const firstPage = createDeferred<PublicTournamentListResult>();
    const loadingMorePage = createDeferred<PublicTournamentListResult>();
    const searchPage = createDeferred<PublicTournamentListResult>();
    const searchNextPage = createDeferred<PublicTournamentListResult>();
    const { client, listPublicTournaments } = createClientMock();

    listPublicTournaments.mockImplementation(
      (options?: { query?: string; cursor?: string | null }) => {
        if (options?.cursor === 'cursor-2') {
          return loadingMorePage.promise;
        }
        if (options?.cursor === 'beta-cursor-2') {
          return searchNextPage.promise;
        }
        if (options?.query === 'Beta') {
          return searchPage.promise;
        }
        return firstPage.promise;
      },
    );

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        onOpenImportConfirm={() => undefined}
      />,
    );

    firstPage.resolve({
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
      nextCursor: 'cursor-2',
    });

    expect(await screen.findByText('Alpha Cup')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '続きを読む' }));
    await waitFor(() => {
      expect(listPublicTournaments).toHaveBeenCalledWith({
        query: '',
        cursor: 'cursor-2',
      });
    });

    await user.type(
      screen.getByLabelText('大会名 / 開催者 / ハッシュタグ'),
      'Beta',
    );
    await user.click(screen.getByRole('button', { name: '検索' }));

    searchPage.resolve({
      items: [
        {
          publicId: 'public-2',
          name: 'Beta Cup',
          owner: 'Bob',
          hashtag: 'IIDX',
          start: '2026-05-01',
          end: '2026-05-07',
          chartCount: 10,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'beta-cursor-2',
    });

    expect(await screen.findByText('Beta Cup')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '続きを読む' }));
    await waitFor(() => {
      expect(listPublicTournaments).toHaveBeenCalledWith({
        query: 'Beta',
        cursor: 'beta-cursor-2',
      });
    });

    loadingMorePage.resolve({
      items: [],
      nextCursor: null,
    });
    searchNextPage.resolve({
      items: [],
      nextCursor: null,
    });
  });
});
