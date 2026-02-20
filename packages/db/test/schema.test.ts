import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';

import { resolveImportMode2 } from '../src/app-db.js';
import { buildAtomicTempFileName } from '../src/opfs.js';
import { APP_DB_SCHEMA_SQL } from '../src/schema.js';

const require = createRequire(import.meta.url);
const sqlWasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

async function createMemoryDb() {
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      if (file === 'sql-wasm.wasm') {
        return sqlWasmPath;
      }
      return file;
    },
  });
  const db = new SQL.Database();
  db.exec(APP_DB_SCHEMA_SQL);
  return db;
}

describe('db schema and mode2 import', () => {
  it('applies migration and sets user_version', async () => {
    const db = await createMemoryDb();
    const result = db.exec('PRAGMA user_version;');
    const userVersion = result[0]?.values?.[0]?.[0];
    expect(userVersion).toBe(2);
    db.close();
  });

  it('enforces unique chart per tournament', async () => {
    const db = await createMemoryDb();
    db.exec(`
      INSERT INTO tournaments(
        tournament_uuid, def_hash, tournament_name, owner, hashtag, start_date, end_date, is_imported, created_at, updated_at
      ) VALUES(
        't1', 'h1', 'name', 'owner', 'tag', '2026-02-01', '2026-02-28', 0, '2026-02-01T00:00:00Z', '2026-02-01T00:00:00Z'
      );
    `);

    db.exec(`INSERT INTO tournament_charts(tournament_uuid, chart_id) VALUES('t1', 100);`);
    expect(() => db.exec(`INSERT INTO tournament_charts(tournament_uuid, chart_id) VALUES('t1', 100);`)).toThrow();
    db.close();
  });

  it('adds needs_send column to evidences', async () => {
    const db = await createMemoryDb();
    const result = db.exec(`PRAGMA table_info('evidences');`);
    const rows = result[0]?.values ?? [];
    const columnNames = rows.map((row) => String(row[1]));
    expect(columnNames).toContain('needs_send');
    db.close();
  });

  it('resolves import mode2 branches', () => {
    expect(resolveImportMode2(null, 'h1')).toBe('insert');
    expect(resolveImportMode2('h1', 'h1')).toBe('already_imported');
    expect(resolveImportMode2('h1', 'h2')).toBe('conflict');
  });

  it('builds atomic tmp file names', () => {
    expect(buildAtomicTempFileName('app_data.sqlite', 'abc')).toBe('app_data.sqlite.tmp.abc');
  });
});
