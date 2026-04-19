import { describe, expect, it } from 'vitest';
import { createWorkerHandler } from '../src/index.js';
import { REGISTER_PUBLIC_TOURNAMENT_PATH } from '../src/routes.js';
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

  async listActive(
    _options: ListActivePublicTournamentsOptions,
  ): Promise<ListActivePublicTournamentsResult> {
    return {
      items: [],
      hasMore: false,
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
  start: '2026-02-01',
  end: '2026-02-28',
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
    method?: string;
    origin?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Request {
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

  return new Request(
    `https://api.example.com${REGISTER_PUBLIC_TOURNAMENT_PATH}`,
    requestInit,
  );
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

describe('public catalog register worker', () => {
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
    });
    expect(repository.recordsByPublicId.size).toBe(1);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://tts1374.github.io',
    );
  });

  it('returns duplicate when the same registry hash is registered again', async () => {
    const repository = new InMemoryRepository();
    const generatedIds = ['public-first-id', 'public-second-id'];
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
    };

    expect(response.status).toBe(201);
    expect(body).toEqual({
      status: 'created',
      publicId: 'public-created-id',
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
});
