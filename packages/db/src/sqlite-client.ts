import * as sqliteWasm from '@sqlite.org/sqlite-wasm';

export type SqlitePromiser = (op: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;
export type SqliteDbId = string | number;

export interface SqliteOpenOptions {
  filename: string;
}

export interface SqliteExecOptions {
  dbId: SqliteDbId;
  sql: string;
  bind?: unknown[];
}

type SqliteRowMode = 'object' | 'array';

function unwrapExecCallbackRow<T>(input: unknown): T | null {
  if (input === null || input === undefined) {
    return null;
  }
  if (typeof input === 'object' && 'row' in (input as Record<string, unknown>)) {
    const wrapped = (input as { row?: unknown }).row;
    if (wrapped === null || wrapped === undefined) {
      return null;
    }
    return wrapped as T;
  }
  return input as T;
}

export class SqliteWorkerClient {
  constructor(private readonly promiser: SqlitePromiser) {}

  async open(options: SqliteOpenOptions): Promise<SqliteDbId> {
    const result = await this.promiser('open', { filename: options.filename });
    const dbId = result.dbId ?? (result.result as { dbId?: SqliteDbId } | undefined)?.dbId;
    if (typeof dbId !== 'string' && typeof dbId !== 'number') {
      throw new Error(`Failed to open sqlite database. response=${JSON.stringify(result)}`);
    }
    return dbId;
  }

  async close(dbId: SqliteDbId): Promise<void> {
    await this.promiser('close', { dbId });
  }

  async exec(options: SqliteExecOptions): Promise<void> {
    const args: Record<string, unknown> = {
      dbId: options.dbId,
      sql: options.sql,
    };
    if (options.bind && options.bind.length > 0) {
      args.bind = options.bind;
    }
    await this.promiser('exec', args);
  }

  private async queryByMode<T>(options: SqliteExecOptions, rowMode: SqliteRowMode): Promise<T[]> {
    const rows: T[] = [];
    const args: Record<string, unknown> = {
      dbId: options.dbId,
      sql: options.sql,
      rowMode,
      callback: (row: unknown) => {
        const normalized = unwrapExecCallbackRow<T>(row);
        if (normalized === null) {
          return;
        }
        rows.push(normalized);
      },
    };
    if (options.bind && options.bind.length > 0) {
      args.bind = options.bind;
    }
    await this.promiser('exec', args);
    return rows;
  }

  async query<T extends Record<string, unknown>>(options: SqliteExecOptions): Promise<T[]> {
    return this.queryByMode<T>(options, 'object');
  }

  async queryArray(options: SqliteExecOptions): Promise<unknown[][]> {
    return this.queryByMode<unknown[]>(options, 'array');
  }
}

export interface CreateSqliteWorkerClientOptions {
  worker?: Worker;
}

export async function createSqliteWorkerClient(
  options: CreateSqliteWorkerClientOptions = {},
): Promise<SqliteWorkerClient> {
  const workerPromiserFactory = (sqliteWasm as unknown as {
    sqlite3Worker1Promiser?: (options: Record<string, unknown>) => unknown;
  }).sqlite3Worker1Promiser;

  if (!workerPromiserFactory) {
    throw new Error('sqlite3Worker1Promiser is not available in @sqlite.org/sqlite-wasm');
  }

  const promiser = await new Promise<SqlitePromiser>((resolve, reject) => {
    let settled = false;
    const settleResolve = (value: SqlitePromiser) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      resolve(value);
    };
    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeoutId);
      reject(error);
    };

    const timeoutId = globalThis.setTimeout(() => {
      const hasSharedArrayBuffer = typeof globalThis.SharedArrayBuffer !== 'undefined';
      settleReject(
        new Error(
          `sqlite worker initialization timed out (crossOriginIsolated=${globalThis.crossOriginIsolated}, SharedArrayBuffer=${hasSharedArrayBuffer})`,
        ),
      );
    }, 15000);

    const worker = options.worker;
    if (worker) {
      worker.onerror = (event) => {
        settleReject(new Error(`sqlite worker script error: ${event.message || 'unknown error'}`));
      };
      worker.onmessageerror = () => {
        settleReject(new Error('sqlite worker message error'));
      };
    }

    const instance = workerPromiserFactory({
      ...(worker ? { worker } : {}),
      onready: () => {
        settleResolve(instance as SqlitePromiser);
      },
      onerror: (error: unknown) => {
        settleReject(error instanceof Error ? error : new Error(String(error)));
      },
      onunhandled: (event: unknown) => {
        const data =
          typeof event === 'object' && event !== null && 'data' in event
            ? (event as { data?: unknown }).data
            : undefined;
        if (typeof data === 'object' && data !== null && 'result' in data) {
          const result = (data as { result?: unknown }).result;
          if (typeof result === 'object' && result !== null && 'message' in result) {
            settleReject(new Error(String((result as { message?: unknown }).message ?? 'sqlite worker error')));
            return;
          }
        }
      },
    });
  });

  return new SqliteWorkerClient(promiser);
}
