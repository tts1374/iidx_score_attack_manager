import * as sqliteWasm from '@sqlite.org/sqlite-wasm';

export type SqlitePromiser = (op: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface SqliteOpenOptions {
  filename: string;
}

export interface SqliteExecOptions {
  dbId: number;
  sql: string;
  bind?: unknown[];
}

export class SqliteWorkerClient {
  constructor(private readonly promiser: SqlitePromiser) {}

  async open(options: SqliteOpenOptions): Promise<number> {
    const result = await this.promiser('open', { filename: options.filename });
    const dbId = Number(result.dbId ?? (result.result as { dbId?: number } | undefined)?.dbId);
    if (!Number.isFinite(dbId)) {
      throw new Error('Failed to open sqlite database.');
    }
    return dbId;
  }

  async close(dbId: number): Promise<void> {
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

  async query<T extends Record<string, unknown>>(options: SqliteExecOptions): Promise<T[]> {
    const rows: T[] = [];
    const args: Record<string, unknown> = {
      dbId: options.dbId,
      sql: options.sql,
      rowMode: 'object',
      callback: (row: T) => {
        rows.push(row);
      },
    };
    if (options.bind && options.bind.length > 0) {
      args.bind = options.bind;
    }
    await this.promiser('exec', args);
    return rows;
  }
}

export async function createSqliteWorkerClient(): Promise<SqliteWorkerClient> {
  const workerPromiserFactory = (sqliteWasm as unknown as {
    sqlite3Worker1Promiser?: (options: Record<string, unknown>) => unknown;
  }).sqlite3Worker1Promiser;

  if (!workerPromiserFactory) {
    throw new Error('sqlite3Worker1Promiser is not available in @sqlite.org/sqlite-wasm');
  }

  const promiser = await new Promise<SqlitePromiser>((resolve, reject) => {
    const instance = workerPromiserFactory({
      onready: () => {
        resolve(instance as SqlitePromiser);
      },
      onerror: (error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    });
  });

  return new SqliteWorkerClient(promiser);
}
