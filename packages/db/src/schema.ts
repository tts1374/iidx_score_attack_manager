export const APP_DB_USER_VERSION = 1;

export const APP_DB_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tournaments (
  tournament_uuid TEXT PRIMARY KEY,
  source_tournament_uuid TEXT UNIQUE,
  def_hash TEXT NOT NULL,
  tournament_name TEXT NOT NULL,
  owner TEXT NOT NULL,
  hashtag TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_imported INTEGER NOT NULL CHECK(is_imported IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_charts (
  tournament_chart_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_uuid TEXT NOT NULL,
  chart_id INTEGER NOT NULL,
  UNIQUE(tournament_uuid, chart_id),
  FOREIGN KEY(tournament_uuid) REFERENCES tournaments(tournament_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidences (
  evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_uuid TEXT NOT NULL,
  chart_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  update_seq INTEGER NOT NULL,
  file_deleted INTEGER NOT NULL DEFAULT 0 CHECK(file_deleted IN (0,1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tournament_uuid, chart_id),
  FOREIGN KEY(tournament_uuid) REFERENCES tournaments(tournament_uuid) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournaments_start_date ON tournaments(start_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_end_date ON tournaments(end_date);
CREATE INDEX IF NOT EXISTS idx_tournament_charts_tournament_uuid ON tournament_charts(tournament_uuid);
CREATE INDEX IF NOT EXISTS idx_evidences_tournament_uuid ON evidences(tournament_uuid);
CREATE INDEX IF NOT EXISTS idx_evidences_file_deleted ON evidences(file_deleted);

PRAGMA user_version = 1;
`;

export async function migrateAppDatabase(executeSql: (sql: string) => Promise<void>): Promise<void> {
  await executeSql(APP_DB_SCHEMA_SQL);
}
