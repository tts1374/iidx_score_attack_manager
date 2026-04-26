import {
  countPublicTournamentChartStyles,
  encodeTournamentPayload,
  normalizeTournamentPayload,
  sha256Text,
} from '@iidx/shared';
import { describe, expect, it } from 'vitest';
import { createWorkerHandler } from '../src/index.js';
import {
  LIST_PUBLIC_TOURNAMENTS_PATH,
  REGISTER_PUBLIC_TOURNAMENT_PATH,
} from '../src/routes.js';
import type {
  ListActivePublicTournamentsOptions,
  ListActivePublicTournamentsResult,
  PublicTournamentAuditLogEntry,
  PublicTournamentRecord,
  PublicTournamentRepository,
} from '../src/repository/public-tournaments.js';

class InMemoryRepository implements PublicTournamentRepository {
  readonly recordsByPublicId = new Map<string, PublicTournamentRecord>();
  readonly recordsByRegistryHash = new Map<string, PublicTournamentRecord>();
  readonly auditLogs: PublicTournamentAuditLogEntry[] = [];

  async countRecentAttempts(
    requestFingerprint: string,
    sinceInclusive: string,
  ): Promise<number> {
    return this.auditLogs.filter(
      (entry) =>
        entry.requestFingerprint === requestFingerprint &&
        entry.createdAt >= sinceInclusive &&
        entry.result !== 'deleted',
    ).length;
  }

  async getByRegistryHash(
    registryHash: string,
  ): Promise<PublicTournamentRecord | null> {
    return this.recordsByRegistryHash.get(registryHash) ?? null;
  }

  async getActiveByPublicId(publicId: string): Promise<PublicTournamentRecord | null> {
    const record = this.recordsByPublicId.get(publicId) ?? null;
    return record && !record.deletedAt ? record : null;
  }

  async listActive(
    options: ListActivePublicTournamentsOptions,
  ): Promise<ListActivePublicTournamentsResult> {
    const normalizedSearch = options.searchQuery?.trim().toLowerCase() ?? '';
    const filtered = [...this.recordsByPublicId.values()]
      .filter((record) => !record.deletedAt)
      .filter((record) => record.startDate >= options.startDateFrom)
      .filter((record) => {
        if (!normalizedSearch) {
          return true;
        }

        return [record.name, record.owner, record.hashtag].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        );
      })
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.publicId.localeCompare(left.publicId),
      );

    const paged = options.cursor
      ? filtered.filter((record) => {
          const cursor = options.cursor;
          if (!cursor) {
            return true;
          }

          return (
            record.createdAt < cursor.createdAt ||
            (record.createdAt === cursor.createdAt &&
              record.publicId < cursor.publicId)
          );
        })
      : filtered;

    const items = paged.slice(0, options.limit + 1).map((record) => {
      const payload = JSON.parse(record.payloadJson) as { charts: number[] };
      const chartStyleCounts = countPublicTournamentChartStyles(payload.charts);

      return {
        publicId: record.publicId,
        name: record.name,
        owner: record.owner,
        hashtag: record.hashtag,
        start: record.startDate,
        end: record.endDate,
        chartCount: record.chartCount,
        spChartCount: chartStyleCounts.spChartCount,
        dpChartCount: chartStyleCounts.dpChartCount,
        createdAt: record.createdAt,
      };
    });

    return {
      items: items.slice(0, options.limit),
      hasMore: items.length > options.limit,
    };
  }

  async create(record: PublicTournamentRecord): Promise<boolean> {
    if (this.recordsByRegistryHash.has(record.registryHash)) {
      return false;
    }

    this.recordsByPublicId.set(record.publicId, record);
    this.recordsByRegistryHash.set(record.registryHash, record);
    return true;
  }

  async softDeleteByPublicId(
    publicId: string,
    deleteTokenHash: string,
    deletedAt: string,
    deleteReason: string,
  ): Promise<boolean> {
    const record = this.recordsByPublicId.get(publicId);
    if (!record || record.deletedAt || record.deleteTokenHash !== deleteTokenHash) {
      return false;
    }
    const deletedRecord = {
      ...record,
      updatedAt: deletedAt,
      deletedAt,
      deleteReason,
    };
    this.recordsByPublicId.set(publicId, deletedRecord);
    this.recordsByRegistryHash.set(record.registryHash, deletedRecord);
    return true;
  }

  async insertAuditLog(entry: PublicTournamentAuditLogEntry): Promise<void> {
    this.auditLogs.push(entry);
  }
}

const validPayload = {
  v: 1,
  uuid: '9f5fb95d-0f2a-4270-81c9-a7f4b58f32af',
  name: 'PUBLIC TOURNAMENT',
  owner: 'owner',
  hashtag: 'iidx',
  start: '2026-04-19',
  end: '2026-05-06',
  charts: [200, 100],
};

function createEnv(overrides: Partial<Record<string, string>> = {}) {
  return {
    DB: {} as D1Database,
    ALLOWED_ORIGINS: 'https://tts1374.github.io',
    RATE_LIMIT_SALT: 'test-salt',
    RATE_LIMIT_MAX_REQUESTS: '10',
    RATE_LIMIT_WINDOW_SECONDS: '3600',
    ...overrides,
  };
}

function createRequest(
  init: {
    path?: string;
    method?: string;
    origin?: string;
    body?: unknown;
    headers?: Record<string, string>;
    searchParams?: Record<string, string | undefined>;
  } = {},
): Request {
  const url = new URL(
    `https://api.example.com${init.path ?? REGISTER_PUBLIC_TOURNAMENT_PATH}`,
  );
  for (const [key, value] of Object.entries(init.searchParams ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers(init.headers);
  headers.set('Origin', init.origin ?? 'https://tts1374.github.io');
  headers.set('CF-Connecting-IP', '203.0.113.10');

  const requestInit: RequestInit = {
    method: init.method ?? 'POST',
    headers,
  };

  if (init.body !== undefined) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    requestInit.body = JSON.stringify(init.body);
  }

  return new Request(url, requestInit);
}

function createStreamingRequest(rawText: string): Request {
  const bytes = new TextEncoder().encode(rawText);
  let offset = 0;

  return {
    url: `https://api.example.com${REGISTER_PUBLIC_TOURNAMENT_PATH}`,
    method: 'POST',
    headers: new Headers({
      Origin: 'https://tts1374.github.io',
      'CF-Connecting-IP': '203.0.113.10',
      'Content-Type': 'application/json',
    }),
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }

        const nextOffset = Math.min(offset + 1024, bytes.length);
        controller.enqueue(bytes.slice(offset, nextOffset));
        offset = nextOffset;
      },
    }),
  } as Request;
}

function createRecord(
  publicId: string,
  createdAt: string,
  overrides: Partial<PublicTournamentRecord> = {},
): PublicTournamentRecord {
  const normalizedPayload = normalizeTournamentPayload({
    ...validPayload,
    name: overrides.name ?? validPayload.name,
    owner: overrides.owner ?? validPayload.owner,
    hashtag: overrides.hashtag ?? validPayload.hashtag,
    start: overrides.startDate ?? validPayload.start,
    end: overrides.endDate ?? validPayload.end,
  });

  return {
    publicId,
    registryHash: `registry-${publicId}`,
    payloadJson: overrides.payloadJson ?? JSON.stringify(normalizedPayload),
    name: overrides.name ?? normalizedPayload.name,
    owner: overrides.owner ?? normalizedPayload.owner,
    hashtag: overrides.hashtag ?? normalizedPayload.hashtag,
    startDate: overrides.startDate ?? normalizedPayload.start,
    endDate: overrides.endDate ?? normalizedPayload.end,
    chartCount: overrides.chartCount ?? normalizedPayload.charts.length,
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    deletedAt: overrides.deletedAt ?? null,
    deleteReason: overrides.deleteReason ?? null,
    deleteTokenHash: overrides.deleteTokenHash ?? 'delete-token-hash',
  };
}

function invokeWorker(
  worker: ReturnType<typeof createWorkerHandler>,
  request: Request,
  env: ReturnType<typeof createEnv>,
): Promise<Response> {
  return Promise.resolve(
    worker.fetch!(
      request as Request<unknown, IncomingRequestCfProperties<unknown>>,
      env,
      {} as ExecutionContext,
    ),
  );
}

describe('public catalog worker', () => {
  it('creates a public tournament and returns a publicId', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    const response = await invokeWorker(
      worker,
      createRequest({ body: validPayload }),
      createEnv(),
    );
    const body = (await response.json()) as {
      status: string;
      publicId: string;
    };

    expect(response.status).toBe(201);
    expect(body).toEqual({
      status: 'created',
      publicId: 'public-created-id',
      deleteToken: 'public-created-id',
    });
    expect(repository.recordsByPublicId.size).toBe(1);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://tts1374.github.io',
    );
  });

  it('returns duplicate when the same registry hash is registered again', async () => {
    const repository = new InMemoryRepository();
    const generatedIds = ['public-first-id', 'delete-token-first', 'public-second-id', 'delete-token-second'];
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => generatedIds.shift() ?? 'fallback-id',
    });

    await invokeWorker(worker, createRequest({ body: validPayload }), createEnv());
    const duplicateResponse = await invokeWorker(
      worker,
      createRequest({
        body: {
          ...validPayload,
          uuid: '11111111-1111-4111-8111-111111111111',
        },
      }),
      createEnv(),
    );

    const body = (await duplicateResponse.json()) as {
      status: string;
      publicId: string;
    };

    expect(duplicateResponse.status).toBe(200);
    expect(body).toEqual({
      status: 'duplicate',
      publicId: 'public-first-id',
    });
    expect(repository.recordsByPublicId.size).toBe(1);
  });

  it('rejects invalid payloads and records an audit log', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    const response = await invokeWorker(
      worker,
      createRequest({
        body: {
          ...validPayload,
          charts: [],
        },
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      error: {
        code: string;
        details?: { reason?: string };
      };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_PAYLOAD');
    expect(body.error.details?.reason).toBe('CHARTS_REQUIRED');
    expect(repository.auditLogs.at(-1)?.result).toBe('invalid_payload');
  });

  it('rejects non-standard json media types', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    const response = await invokeWorker(
      worker,
      createRequest({
        body: validPayload,
        headers: {
          'Content-Type': 'application/json-patch+json',
        },
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(415);
    expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(repository.auditLogs.at(-1)?.result).toBe('unsupported_media_type');
  });

  it('accepts application json with charset parameter', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    const response = await invokeWorker(
      worker,
      createRequest({
        body: validPayload,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      status: string;
      publicId: string;
      deleteToken?: string;
    };

    expect(response.status).toBe(201);
    expect(body).toEqual({
      status: 'created',
      publicId: 'public-created-id',
      deleteToken: 'public-created-id',
    });
    expect(repository.auditLogs.at(-1)?.result).toBe('accepted');
  });

  it('rate limits repeated requests and stores a hashed fingerprint', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    await invokeWorker(
      worker,
      createRequest({ body: validPayload }),
      createEnv({ RATE_LIMIT_MAX_REQUESTS: '1' }),
    );
    const response = await invokeWorker(
      worker,
      createRequest({
        body: {
          ...validPayload,
          uuid: '11111111-1111-4111-8111-111111111111',
        },
      }),
      createEnv({ RATE_LIMIT_MAX_REQUESTS: '1' }),
    );
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(repository.auditLogs.at(-1)?.result).toBe('rate_limited');
    expect(repository.auditLogs.at(-1)?.requestFingerprint).not.toBe(
      '203.0.113.10',
    );
  });

  it('handles CORS allowlist for preflight and rejects disallowed origins', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    const preflight = await invokeWorker(
      worker,
      createRequest({
        method: 'OPTIONS',
        body: undefined,
        headers: {
          'Access-Control-Request-Method': 'POST',
        },
      }),
      createEnv(),
    );
    const rejected = await invokeWorker(
      worker,
      createRequest({
        origin: 'https://evil.example.com',
        body: validPayload,
      }),
      createEnv(),
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://tts1374.github.io',
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(repository.auditLogs.at(-1)?.result).toBe('origin_rejected');
  });

  it('applies rate limiting before logging repeated disallowed origins', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });

    const firstRejected = await invokeWorker(
      worker,
      createRequest({
        origin: 'https://evil.example.com',
        body: validPayload,
      }),
      createEnv({ RATE_LIMIT_MAX_REQUESTS: '1' }),
    );
    const rateLimited = await invokeWorker(
      worker,
      createRequest({
        origin: 'https://evil.example.com',
        body: {
          ...validPayload,
          uuid: '11111111-1111-4111-8111-111111111111',
        },
      }),
      createEnv({ RATE_LIMIT_MAX_REQUESTS: '1' }),
    );
    const body = (await rateLimited.json()) as {
      error: { code: string };
    };

    expect(firstRejected.status).toBe(403);
    expect(rateLimited.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(repository.auditLogs.map((entry) => entry.result)).toEqual([
      'origin_rejected',
      'rate_limited',
    ]);
  });

  it('rejects oversized streaming bodies before buffering the full payload', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-created-id',
    });
    const oversizedBody = JSON.stringify({
      ...validPayload,
      name: 'A'.repeat(33000),
    });

    const response = await invokeWorker(
      worker,
      createStreamingRequest(oversizedBody),
      createEnv(),
    );
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(413);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(repository.auditLogs.at(-1)?.result).toBe('payload_too_large');
  });

  it('lists active public tournaments with stable cursor pagination', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
    });

    for (let index = 0; index < 19; index += 1) {
      const publicId = `public-${String(index + 1).padStart(2, '0')}`;
      const createdAt = `2026-04-${String(28 - index).padStart(2, '0')}T12:00:00.000Z`;
      await repository.create(createRecord(publicId, createdAt));
    }
    await repository.create(
      createRecord('public-20b', '2026-04-01T12:00:00.000Z', {
        name: 'Boundary B',
      }),
    );
    await repository.create(
      createRecord('public-20a', '2026-04-01T12:00:00.000Z', {
        name: 'Boundary A',
      }),
    );
    await repository.create(
      createRecord('deleted-public', '2026-05-01T12:00:00.000Z', {
        deletedAt: '2026-05-02T12:00:00.000Z',
        deleteReason: 'spam',
      }),
    );

    const firstPage = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
      }),
      createEnv(),
    );
    const firstBody = (await firstPage.json()) as {
      items: Array<{ publicId: string }>;
      nextCursor: string | null;
    };

    expect(firstPage.status).toBe(200);
    expect(firstBody.items).toHaveLength(20);
    expect(firstBody.items[0]?.publicId).toBe('public-01');
    expect(firstBody.items.at(-1)?.publicId).toBe('public-20b');
    expect(firstBody.items.some((item) => item.publicId === 'deleted-public')).toBe(
      false,
    );
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const secondPage = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
        searchParams: {
          cursor: firstBody.nextCursor ?? undefined,
        },
      }),
      createEnv(),
    );
    const secondBody = (await secondPage.json()) as {
      items: Array<{ publicId: string }>;
      nextCursor: string | null;
    };

    expect(secondPage.status).toBe(200);
    expect(secondBody.items.map((item) => item.publicId)).toEqual(['public-20a']);
    expect(secondBody.nextCursor).toBeNull();
  });

  it('keeps the initial JST date boundary across cursor pagination', async () => {
    const repository = new InMemoryRepository();
    let currentTime = new Date('2026-04-18T14:30:00.000Z');
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => currentTime,
    });

    for (let index = 0; index < 21; index += 1) {
      const publicId = `boundary-public-${String(index + 1).padStart(2, '0')}`;
      const createdAt = `2026-04-${String(28 - index).padStart(2, '0')}T12:00:00.000Z`;
      await repository.create(
        createRecord(publicId, createdAt, {
          startDate: '2026-04-18',
        }),
      );
    }

    const firstPage = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
      }),
      createEnv(),
    );
    const firstBody = (await firstPage.json()) as {
      items: Array<{ publicId: string }>;
      nextCursor: string | null;
    };
    currentTime = new Date('2026-04-18T15:30:00.000Z');

    const secondPage = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
        searchParams: {
          cursor: firstBody.nextCursor ?? undefined,
        },
      }),
      createEnv(),
    );
    const secondBody = (await secondPage.json()) as {
      items: Array<{ publicId: string }>;
      nextCursor: string | null;
    };

    expect(firstPage.status).toBe(200);
    expect(firstBody.items).toHaveLength(20);
    expect(secondPage.status).toBe(200);
    expect(secondBody.items.map((item) => item.publicId)).toEqual([
      'boundary-public-21',
    ]);
    expect(secondBody.nextCursor).toBeNull();
  });

  it('trims search queries and treats blank q as unfiltered', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
    });

    await repository.create(
      createRecord('public-alpha', '2026-04-19T12:00:00.000Z', {
        name: 'Alpha Cup',
        owner: 'owner-a',
        hashtag: 'alpha',
      }),
    );
    await repository.create(
      createRecord('public-beta', '2026-04-18T12:00:00.000Z', {
        name: 'Beta Cup',
        owner: 'owner-b',
        hashtag: 'beta',
      }),
    );

    const filtered = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
        searchParams: {
          q: '  owner-b  ',
        },
      }),
      createEnv(),
    );
    const filteredBody = (await filtered.json()) as {
      items: Array<{ publicId: string }>;
    };
    const blankQuery = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
        searchParams: {
          q: '   ',
        },
      }),
      createEnv(),
    );
    const blankQueryBody = (await blankQuery.json()) as {
      items: Array<{ publicId: string }>;
    };

    expect(filtered.status).toBe(200);
    expect(filteredBody.items.map((item) => item.publicId)).toEqual(['public-beta']);
    expect(blankQuery.status).toBe(200);
    expect(blankQueryBody.items.map((item) => item.publicId)).toEqual([
      'public-alpha',
      'public-beta',
    ]);
  });

  it('returns SP and DP chart counts in list responses', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
    });

    await repository.create(
      createRecord('public-style-counts', '2026-04-19T12:00:00.000Z', {
        chartCount: 4,
        payloadJson: JSON.stringify({
          ...validPayload,
          charts: [1, 5, 6, 9],
        }),
      }),
    );

    const response = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      items: Array<{
        publicId: string;
        chartCount: number;
        spChartCount: number;
        dpChartCount: number;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.items[0]).toMatchObject({
      publicId: 'public-style-counts',
      chartCount: 4,
      spChartCount: 2,
      dpChartCount: 2,
    });
  });

  it('rejects invalid list cursors', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
    });

    const response = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
        searchParams: {
          cursor: 'not-a-valid-cursor',
        },
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      error: { code: string };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('lists only tournaments starting today or later in JST', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-18T15:30:00.000Z'),
    });

    await repository.create(
      createRecord('past-public', '2026-04-21T12:00:00.000Z', {
        startDate: '2026-04-18',
      }),
    );
    await repository.create(
      createRecord('today-public', '2026-04-20T12:00:00.000Z', {
        startDate: '2026-04-19',
      }),
    );
    await repository.create(
      createRecord('future-public', '2026-04-19T12:00:00.000Z', {
        startDate: '2026-04-20',
      }),
    );

    const response = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      items: Array<{ publicId: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.items.map((item) => item.publicId)).toEqual([
      'today-public',
      'future-public',
    ]);
  });

  it('soft deletes public tournaments with a delete token', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
      randomUUID: () => 'public-delete-id',
    });

    await repository.create(
      createRecord('public-delete-id', '2026-04-19T12:00:00.000Z', {
        deleteTokenHash: sha256Text('delete-token-1'),
      }),
    );

    const response = await invokeWorker(
      worker,
      createRequest({
        path: `${LIST_PUBLIC_TOURNAMENTS_PATH}/public-delete-id`,
        method: 'DELETE',
        headers: {
          'X-Public-Catalog-Delete-Token': 'delete-token-1',
        },
      }),
      createEnv(),
    );
    const listResponse = await invokeWorker(
      worker,
      createRequest({
        path: LIST_PUBLIC_TOURNAMENTS_PATH,
        method: 'GET',
      }),
      createEnv(),
    );
    const listBody = (await listResponse.json()) as {
      items: Array<{ publicId: string }>;
    };

    expect(response.status).toBe(204);
    expect(repository.recordsByPublicId.get('public-delete-id')).toMatchObject({
      deletedAt: '2026-04-19T12:00:00.000Z',
      deleteReason: 'local_tournament_deleted',
    });
    expect(listBody.items).toEqual([]);
  });

  it('rejects public tournament deletes with a missing or invalid token', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
      now: () => new Date('2026-04-19T12:00:00.000Z'),
    });

    await repository.create(
      createRecord('public-delete-id', '2026-04-19T12:00:00.000Z', {
        deleteTokenHash: sha256Text('delete-token-1'),
      }),
    );

    const missingToken = await invokeWorker(
      worker,
      createRequest({
        path: `${LIST_PUBLIC_TOURNAMENTS_PATH}/public-delete-id`,
        method: 'DELETE',
      }),
      createEnv(),
    );
    const invalidToken = await invokeWorker(
      worker,
      createRequest({
        path: `${LIST_PUBLIC_TOURNAMENTS_PATH}/public-delete-id`,
        method: 'DELETE',
        headers: {
          'X-Public-Catalog-Delete-Token': 'wrong-token',
        },
      }),
      createEnv(),
    );

    expect(missingToken.status).toBe(400);
    expect(invalidToken.status).toBe(404);
    expect(repository.recordsByPublicId.get('public-delete-id')?.deletedAt).toBeNull();
  });

  it('returns payloadParam for active public tournaments', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
    });

    const record = createRecord('public-payload', '2026-04-19T12:00:00.000Z');
    await repository.create(record);

    const response = await invokeWorker(
      worker,
      createRequest({
        path: `${LIST_PUBLIC_TOURNAMENTS_PATH}/public-payload/payload`,
        method: 'GET',
      }),
      createEnv(),
    );
    const body = (await response.json()) as {
      payloadParam: string;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      payloadParam: encodeTournamentPayload(JSON.parse(record.payloadJson)),
    });
  });

  it('returns 404 for missing or deleted payload lookups', async () => {
    const repository = new InMemoryRepository();
    const worker = createWorkerHandler({
      createRepository: () => repository,
    });

    await repository.create(
      createRecord('public-deleted', '2026-04-19T12:00:00.000Z', {
        deletedAt: '2026-04-20T12:00:00.000Z',
        deleteReason: 'deleted',
      }),
    );

    const missing = await invokeWorker(
      worker,
      createRequest({
        path: `${LIST_PUBLIC_TOURNAMENTS_PATH}/missing/payload`,
        method: 'GET',
      }),
      createEnv(),
    );
    const deleted = await invokeWorker(
      worker,
      createRequest({
        path: `${LIST_PUBLIC_TOURNAMENTS_PATH}/public-deleted/payload`,
        method: 'GET',
      }),
      createEnv(),
    );

    expect(missing.status).toBe(404);
    expect(deleted.status).toBe(404);
  });
});
