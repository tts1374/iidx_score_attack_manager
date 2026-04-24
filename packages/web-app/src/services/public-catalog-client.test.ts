import { describe, expect, it, vi } from 'vitest';

import {
  FetchPublicCatalogClient,
  PublicCatalogClientError,
} from './public-catalog-client';
describe('FetchPublicCatalogClient', () => {
  it('registers tournaments for the local publish flow', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://catalog.example.test/api/public-tournaments',
      );

      return new Response(
        JSON.stringify({
          status: 'created',
          publicId: 'public-created-id',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    });
    const client = new FetchPublicCatalogClient(
      {
        apiBaseUrl: 'https://catalog.example.test/',
        source: 'env',
      },
      fetchImpl,
    );

    const response = await client.registerTournament({
      v: 1,
      uuid: 'uuid-1',
      name: 'Alpha Cup',
      owner: 'Alice',
      hashtag: 'IIDX',
      start: '2026-04-01',
      end: '2026-04-07',
      charts: [1, 2, 3],
    });

    expect(response).toEqual({
      status: 'created',
      publicId: 'public-created-id',
    });
  });

  it('lists public tournaments with query and cursor parameters', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://catalog.example.test/api/public-tournaments?q=Alpha&cursor=cursor-1',
      );

      return new Response(
        JSON.stringify({
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
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    });
    const client = new FetchPublicCatalogClient(
      {
        apiBaseUrl: 'https://catalog.example.test/',
        source: 'env',
      },
      fetchImpl,
    );

    const response = await client.listPublicTournaments({
      query: ' Alpha ',
      cursor: 'cursor-1',
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.publicId).toBe('public-1');
    expect(response.nextCursor).toBe('cursor-2');
  });

  it('calls the configured fetch function without binding it to the client instance', async () => {
    const fetchImpl = vi.fn(function (this: unknown, input: RequestInfo | URL) {
      expect(this).toBeUndefined();
      expect(String(input)).toBe(
        'https://catalog.example.test/api/public-tournaments',
      );

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    });
    const client = new FetchPublicCatalogClient(
      {
        apiBaseUrl: 'https://catalog.example.test/',
        source: 'env',
      },
      fetchImpl,
    );

    await expect(client.listPublicTournaments()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('throws a typed error when the payload endpoint returns an API error', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://catalog.example.test/api/public-tournaments/public-404/payload',
      );

      return new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'public tournament not found',
          },
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    });
    const client = new FetchPublicCatalogClient(
      {
        apiBaseUrl: 'https://catalog.example.test/',
        source: 'env',
      },
      fetchImpl,
    );

    await expect(
      client.getPublicTournamentPayload('public-404'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PublicCatalogClientError>>({
        name: 'PublicCatalogClientError',
        status: 404,
        code: 'NOT_FOUND',
        message: 'public tournament not found',
      }),
    );
  });
});
