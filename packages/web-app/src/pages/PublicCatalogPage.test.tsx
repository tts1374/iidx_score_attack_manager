import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PublicCatalogPage } from './PublicCatalogPage';
import type { PublicCatalogClient } from '../services/public-catalog-client';
import { PublicCatalogClientError } from '../services/public-catalog-client';
import { ensureI18n } from '../i18n';

type PublicTournamentListResult = Awaited<
  ReturnType<PublicCatalogClient['listPublicTournaments']>
>;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    tournamentUuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
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
        tournamentUuid: string;
        name: string;
        owner: string;
        hashtag: string;
        start: string;
        end: string;
        chartCount: number;
        spChartCount: number;
        dpChartCount: number;
        chartPreview: Array<{
          chartId: number;
          title: string;
          playStyle: 'SP' | 'DP' | null;
        }>;
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
          tournamentUuid: '11111111-1111-4111-8111-111111111111',
          name: 'Alpha Cup',
          owner: 'Alice',
          hashtag: 'IIDX',
          start: '2026-04-01',
          end: '2026-04-07',
          chartCount: 12,
          spChartCount: 7,
          dpChartCount: 5,
          chartPreview: [
            { chartId: 1, title: 'music:1', playStyle: null },
            { chartId: 6, title: 'music:1', playStyle: null },
            { chartId: 10, title: 'music:2', playStyle: null },
            { chartId: 15, title: 'music:2', playStyle: null },
          ],
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    expect(await screen.findByText('Alpha Cup')).toBeTruthy();
    expect(screen.queryByText('開催者: Alice')).toBeNull();
    expect(screen.getByText('譜面数: 12（SP 7 / DP 5）')).toBeTruthy();
    expect(screen.getByText('登録曲')).toBeTruthy();
    expect(screen.getAllByText('music:1')).toHaveLength(2);
    expect(screen.getAllByText('music:2')).toHaveLength(2);
    expect(screen.queryByText('ほか 1 譜面')).toBeNull();
    await user.click(screen.getByRole('button', { name: '取り込み確認' }));

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
    expect(screen.queryByText('登録曲')).toBeNull();

    await user.click(screen.getByRole('button', { name: '続きを読む' }));

    expect(await screen.findByText('40件表示中')).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenCalledWith({
      query: '',
      cursor: 'cursor-2',
    });
  });

  it('skips imported tournaments and continues to the next page', async () => {
    const { client, listPublicTournaments } = createClientMock();
    const importedItem = createListItem(1);
    const visibleItem = createListItem(2);

    listPublicTournaments
      .mockResolvedValueOnce({
        items: [importedItem],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [visibleItem],
        nextCursor: null,
      });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        importedTournamentUuids={new Set([importedItem.tournamentUuid])}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 2')).toBeTruthy();
    expect(screen.queryByText('Cup 1')).toBeNull();
    expect(screen.getByText('1件表示中')).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenNthCalledWith(2, {
      query: '',
      cursor: 'cursor-2',
    });
  });

  it('stops when excluded pages repeat the same cursor', async () => {
    const { client, listPublicTournaments } = createClientMock();
    const importedItem = createListItem(1);

    listPublicTournaments
      .mockResolvedValueOnce({
        items: [importedItem],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [importedItem],
        nextCursor: 'cursor-2',
      });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        importedTournamentUuids={new Set([importedItem.tournamentUuid])}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('公開中のスコアタはまだありません。')).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenCalledTimes(2);
  });

  it('uses resolved song master titles for chart preview when provided', async () => {
    const { client, listPublicTournaments } = createClientMock();
    const resolveChartPreviewDetails = vi.fn(async () =>
      new Map([
        [
          1,
          { title: 'MAX 300', playStyle: 'SP' as const, difficulty: 'ANOTHER' },
        ],
        [
          6,
          { title: 'MAX 300', playStyle: 'DP' as const, difficulty: 'HYPER' },
        ],
      ]),
    );

    listPublicTournaments.mockResolvedValue({
      items: [
        {
          ...createListItem(1),
          chartPreview: [
            { chartId: 1, title: 'music:1', playStyle: null },
            { chartId: 6, title: 'music:1', playStyle: null },
          ],
        },
      ],
      nextCursor: null,
    });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        resolveChartPreviewDetails={resolveChartPreviewDetails}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('MAX 300 / SPA')).toBeTruthy();
    expect(screen.getByText('MAX 300 / DPH')).toBeTruthy();
    expect(resolveChartPreviewDetails).toHaveBeenCalledWith([1, 6]);
  });

  it('keeps the current list when song master readiness changes', async () => {
    const { client, listPublicTournaments } = createClientMock();
    const resolveChartPreviewDetails = vi.fn(async () =>
      new Map([
        [
          1,
          { title: 'MAX 300', playStyle: 'SP' as const, difficulty: 'ANOTHER' },
        ],
      ]),
    );

    listPublicTournaments.mockResolvedValue({
      items: [
        {
          ...createListItem(1),
          chartPreview: [{ chartId: 1, title: 'music:1', playStyle: null }],
        },
      ],
      nextCursor: null,
    });

    const { rerender } = render(
      <PublicCatalogPage
        client={client}
        songMasterReady={false}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 1')).toBeTruthy();
    expect(screen.getByText('music:1')).toBeTruthy();

    rerender(
      <PublicCatalogPage
        client={client}
        songMasterReady
        resolveChartPreviewDetails={resolveChartPreviewDetails}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('MAX 300 / SPA')).toBeTruthy();
    expect(screen.getByText('Cup 1')).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenCalledTimes(1);
    expect(resolveChartPreviewDetails).toHaveBeenCalledWith([1]);
  });

  it('keeps resolved preview updates when loading more finishes first', async () => {
    const user = userEvent.setup();
    const titleResolution = createDeferred<
      ReadonlyMap<
        number,
        {
          title: string;
          playStyle: 'SP' | 'DP' | null;
          difficulty: string | null;
        }
      >
    >();
    const { client, listPublicTournaments } = createClientMock();
    const resolveChartPreviewDetails = vi.fn(() => titleResolution.promise);

    listPublicTournaments
      .mockResolvedValueOnce({
        items: [
          {
            ...createListItem(1),
            chartPreview: [{ chartId: 1, title: 'music:1', playStyle: null }],
          },
        ],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [createListItem(2)],
        nextCursor: null,
      });

    const { rerender } = render(
      <PublicCatalogPage
        client={client}
        songMasterReady={false}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 1')).toBeTruthy();
    expect(screen.getByText('music:1')).toBeTruthy();

    rerender(
      <PublicCatalogPage
        client={client}
        songMasterReady
        resolveChartPreviewDetails={resolveChartPreviewDetails}
        onOpenImportConfirm={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '続きを読む' }));

    expect(await screen.findByText('Cup 2')).toBeTruthy();

    titleResolution.resolve(
      new Map([
        [1, { title: 'MAX 300', playStyle: 'SP', difficulty: 'ANOTHER' }],
      ]),
    );

    expect(await screen.findByText('MAX 300 / SPA')).toBeTruthy();
    expect(screen.getByText('Cup 2')).toBeTruthy();
    expect(listPublicTournaments).toHaveBeenCalledTimes(2);
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
      await screen.findByText('公開スコアタの取得に失敗しました。'),
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
          tournamentUuid: '11111111-1111-4111-8111-111111111111',
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
      screen.getByLabelText('スコアタ名 / ハッシュタグ'),
      'Beta',
    );
    await user.click(screen.getByRole('button', { name: '検索' }));

    searchPage.resolve({
      items: [
        {
          publicId: 'public-2',
          tournamentUuid: '22222222-2222-4222-8222-222222222222',
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

  it('shows delete action only for locally owned public score attacks', async () => {
    const { client, listPublicTournaments } = createClientMock();

    listPublicTournaments.mockResolvedValue({
      items: [createListItem(1), createListItem(2)],
      nextCursor: null,
    });

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        localDeleteTokensByPublicId={new Map([['public-1', 'delete-token-1']])}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 1')).toBeTruthy();
    expect(await screen.findByText('Cup 2')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '公開を削除' })).toHaveLength(1);
  });

  it('deletes a locally owned public score attack and removes it from the list', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments, deletePublicTournament } =
      createClientMock();

    listPublicTournaments.mockResolvedValue({
      items: [createListItem(1)],
      nextCursor: null,
    });
    deletePublicTournament.mockResolvedValue(undefined);

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        localDeleteTokensByPublicId={new Map([['public-1', 'delete-token-1']])}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '公開を削除' }));
    expect(
      screen.getByText('公開スコアタを削除しますか？'),
    ).toBeTruthy();

    const deleteButtons = screen.getAllByRole('button', { name: '公開を削除' });
    await user.click(deleteButtons[deleteButtons.length - 1]!);

    await waitFor(() => {
      expect(deletePublicTournament).toHaveBeenCalledWith(
        'public-1',
        'delete-token-1',
      );
    });
    expect(await screen.findByText('公開スコアタを削除しました。')).toBeTruthy();
    expect(screen.queryByText('Cup 1')).toBeNull();
  });

  it('keeps the item and shows an error when delete fails', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments, deletePublicTournament } =
      createClientMock();

    listPublicTournaments.mockResolvedValue({
      items: [createListItem(1)],
      nextCursor: null,
    });
    deletePublicTournament.mockRejectedValue(new Error('delete failed'));

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        localDeleteTokensByPublicId={new Map([['public-1', 'delete-token-1']])}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '公開を削除' }));
    const deleteButtons = screen.getAllByRole('button', { name: '公開を削除' });
    await user.click(deleteButtons[deleteButtons.length - 1]!);

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveProperty(
      'textContent', expect.stringContaining('公開スコアタの削除に失敗しました。'),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Cup 1')).toBeTruthy();
  });

  it('disables import while delete is pending', async () => {
    const user = userEvent.setup();
    const deleteRequest = createDeferred<void>();
    const { client, listPublicTournaments, deletePublicTournament } =
      createClientMock();

    listPublicTournaments.mockResolvedValue({
      items: [createListItem(1)],
      nextCursor: null,
    });
    deletePublicTournament.mockReturnValue(deleteRequest.promise);

    render(
      <PublicCatalogPage
        client={client}
        songMasterReady
        localDeleteTokensByPublicId={new Map([['public-1', 'delete-token-1']])}
        onOpenImportConfirm={() => undefined}
      />,
    );

    expect(await screen.findByText('Cup 1')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '公開を削除' }));
    const deleteButtons = screen.getAllByRole('button', { name: '公開を削除' });
    await user.click(deleteButtons[deleteButtons.length - 1]!);

    expect(
      screen
        .getByTestId('public-catalog-delete-button-public-1')
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen
        .getByTestId('public-catalog-import-button-public-1')
        .hasAttribute('disabled'),
    ).toBe(true);

    deleteRequest.resolve();
  });

  it('keeps search disabled when the catalog is unavailable', () => {
    const { client, isAvailable, listPublicTournaments } = createClientMock();
    isAvailable.mockReturnValue(false);
    render(<PublicCatalogPage client={client} songMasterReady onOpenImportConfirm={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('未設定');
    expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '検索' }).hasAttribute('disabled')).toBe(true);
    expect(listPublicTournaments).not.toHaveBeenCalled();
  });

  it('announces initial loading and the loaded count', async () => {
    const { client, listPublicTournaments } = createClientMock();
    const request = createDeferred<PublicTournamentListResult>();
    listPublicTournaments.mockReturnValue(request.promise);
    render(<PublicCatalogPage client={client} songMasterReady onOpenImportConfirm={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('公開スコアタを読み込み中...');
    request.resolve({ items: [createListItem(1)], nextCursor: 'next' });
    expect(await screen.findByRole('status')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1件表示中'));
  });

  it('searches by Enter and clears an unmatched query without changing request parameters', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments } = createClientMock();
    listPublicTournaments.mockImplementation(async ({ query }: { query: string }) => ({
      items: query === 'missing' ? [] : [createListItem(1)], nextCursor: null,
    }));
    render(<PublicCatalogPage client={client} songMasterReady onOpenImportConfirm={vi.fn()} />);
    await screen.findByText('Cup 1');
    const input = screen.getByRole('textbox', { name: 'スコアタ名 / ハッシュタグ' });
    await user.type(input, '  Cup 1  {Enter}');
    await screen.findByText('Cup 1');
    expect(listPublicTournaments).toHaveBeenLastCalledWith({ query: 'Cup 1', cursor: null });
    await user.clear(input);
    await user.type(input, 'missing{Enter}');
    expect((await screen.findByRole('status')).textContent).toContain('条件に一致する');
    expect(screen.queryByText('公開されているスコアタを検索して取り込めます。')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'すべて解除' })[0]!);
    await screen.findByText('Cup 1');
    expect(listPublicTournaments).toHaveBeenLastCalledWith({ query: '', cursor: null });
  });

  it('keeps browsing available without song data but prevents importing', async () => {
    const { client, listPublicTournaments, getPublicTournamentPayload } = createClientMock();
    listPublicTournaments.mockResolvedValue({ items: [createListItem(1)], nextCursor: null });
    render(<PublicCatalogPage client={client} songMasterReady={false} onOpenImportConfirm={vi.fn()} />);
    await screen.findByText('Cup 1');
    expect(screen.getByRole('alert').textContent).toContain('設定で曲データ');
    const button = screen.getByRole('button', { name: '取り込み確認' });
    expect(button.hasAttribute('disabled')).toBe(true);
    (button as HTMLButtonElement).click();
    expect(getPublicTournamentPayload).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', new PublicCatalogClientError('api', 'missing', 'NOT_FOUND', 404), '対象の公開スコアタが見つかりませんでした。'],
    ['failed', new Error('failed'), '公開スコアタの取り込みに失敗しました。'],
    ['offline', new Error('offline'), 'オフライン'],
  ])('reports an import %s without opening confirmation', async (kind, error, message) => {
    const user = userEvent.setup();
    if (kind === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { client, listPublicTournaments, getPublicTournamentPayload } = createClientMock();
    listPublicTournaments.mockResolvedValue({ items: [createListItem(1)], nextCursor: null });
    getPublicTournamentPayload.mockRejectedValue(error);
    const open = vi.fn();
    render(<PublicCatalogPage client={client} songMasterReady onOpenImportConfirm={open} />);
    await user.click(await screen.findByRole('button', { name: '取り込み確認' }));
    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(getPublicTournamentPayload).toHaveBeenCalledWith('public-1');
    expect(open).not.toHaveBeenCalled();
  });

  it('prevents duplicate import requests and forwards the unchanged payload', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments, getPublicTournamentPayload } = createClientMock();
    const request = createDeferred<{ payloadParam: string }>();
    listPublicTournaments.mockResolvedValue({ items: [createListItem(1)], nextCursor: null });
    getPublicTournamentPayload.mockReturnValue(request.promise);
    const open = vi.fn();
    render(<PublicCatalogPage client={client} songMasterReady onOpenImportConfirm={open} />);
    const button = await screen.findByRole('button', { name: '取り込み確認' });
    await user.click(button);
    (button as HTMLButtonElement).click();
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(getPublicTournamentPayload).toHaveBeenCalledTimes(1);
    request.resolve({ payloadParam: 'original-encoded-payload' });
    await waitFor(() => expect(open).toHaveBeenCalledWith('original-encoded-payload'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps loaded items and retries the same cursor after an additional-load failure', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments } = createClientMock();
    const request = createDeferred<PublicTournamentListResult>();
    listPublicTournaments.mockResolvedValueOnce({ items: [createListItem(1)], nextCursor: 'next' })
      .mockReturnValueOnce(request.promise)
      .mockResolvedValueOnce({ items: [createListItem(2)], nextCursor: null });
    render(<PublicCatalogPage client={client} songMasterReady onOpenImportConfirm={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: '続きを読む' }));
    expect(screen.getByRole('button', { name: '続きを読み込み中...' }).hasAttribute('disabled')).toBe(true);
    request.reject(new Error('failed'));
    await screen.findByRole('alert');
    expect(screen.getByText('Cup 1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '続きを読む' }));
    await screen.findByText('Cup 2');
    expect(listPublicTournaments).toHaveBeenLastCalledWith({ query: '', cursor: 'next' });
    expect(screen.getByRole('status').textContent).toBe('2件表示中');
  });

  it('cancels publication deletion without calling the client', async () => {
    const user = userEvent.setup();
    const { client, listPublicTournaments, deletePublicTournament } = createClientMock();
    listPublicTournaments.mockResolvedValue({ items: [createListItem(1)], nextCursor: null });
    render(<PublicCatalogPage client={client} songMasterReady localDeleteTokensByPublicId={new Map([['public-1', 'token']])} onOpenImportConfirm={vi.fn()} />);
    await user.click(await screen.findByRole('button', { name: '公開を削除' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-describedby')).toBe('public-catalog-delete-description');
    expect(within(dialog).getByText(/この端末のスコアタ・画像は残ります/).textContent).toContain('Cup 1');
    await user.click(within(dialog).getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(deletePublicTournament).not.toHaveBeenCalled();
  });

  it.each([
    ['ja', '取り込み確認', '公開を削除', '画像は残ります'],
    ['en', 'Review import', 'Delete from catalog', 'images on this device will be kept'],
    ['ko', '가져오기 확인', '공개 삭제', '이미지는 유지됩니다'],
  ] as const)('keeps %s action names and local-image preservation aligned', async (language, importName, deleteName, notice) => {
    await ensureI18n(language);
    const user = userEvent.setup();
    const { client, listPublicTournaments } = createClientMock();
    listPublicTournaments.mockResolvedValue({ items: [createListItem(1)], nextCursor: null });
    render(<PublicCatalogPage client={client} songMasterReady localDeleteTokensByPublicId={new Map([['public-1', 'token']])} onOpenImportConfirm={vi.fn()} />);
    expect(await screen.findByRole('button', { name: importName })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: deleteName }));
    expect(screen.getByRole('dialog').textContent).toContain(notice);
  });
});
