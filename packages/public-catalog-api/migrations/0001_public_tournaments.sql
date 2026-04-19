CREATE TABLE IF NOT EXISTS public_tournaments (
  public_id TEXT PRIMARY KEY,
  registry_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  hashtag TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  chart_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_public_tournaments_created_at
  ON public_tournaments (created_at DESC, public_id DESC);

CREATE INDEX IF NOT EXISTS idx_public_tournaments_deleted_at
  ON public_tournaments (deleted_at, created_at DESC, public_id DESC);

CREATE TABLE IF NOT EXISTS public_tournament_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT,
  registry_hash TEXT,
  result TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  origin TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_public_tournament_audit_logs_request_fingerprint
  ON public_tournament_audit_logs (request_fingerprint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_tournament_audit_logs_public_id
  ON public_tournament_audit_logs (public_id, created_at DESC);
