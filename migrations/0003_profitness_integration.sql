CREATE TABLE IF NOT EXISTS orbit_profitness_account (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  account_id TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL UNIQUE,
  account_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS orbit_profitness_links (
  fitness_user_id TEXT PRIMARY KEY,
  orbit_account_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'connected', 'disconnected')),
  fitness_sync_entitled INTEGER NOT NULL CHECK (fitness_sync_entitled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orbit_account_id) REFERENCES orbit_profitness_account(account_id)
) STRICT;

CREATE INDEX IF NOT EXISTS orbit_profitness_links_status
  ON orbit_profitness_links(status, updated_at);

CREATE TABLE IF NOT EXISTS orbit_profitness_summaries (
  fitness_user_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  summary_version INTEGER NOT NULL DEFAULT 1,
  week_starts_on TEXT NOT NULL,
  completed_this_week INTEGER NOT NULL,
  weekly_target INTEGER NOT NULL,
  source_updated_at TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fitness_user_id) REFERENCES orbit_profitness_links(fitness_user_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS orbit_profitness_events (
  idempotency_key TEXT PRIMARY KEY,
  fitness_user_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fitness_user_id) REFERENCES orbit_profitness_links(fitness_user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS orbit_profitness_events_received
  ON orbit_profitness_events(received_at);
