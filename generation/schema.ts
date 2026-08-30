export const GENERATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS orbit_generation_history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    idea_json TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'generated',
    accepted_at TEXT,
    UNIQUE(owner, fingerprint)
  ) STRICT`,
  `CREATE INDEX IF NOT EXISTS orbit_generation_owner_seq ON orbit_generation_history(owner, seq DESC)`,
  `CREATE TABLE IF NOT EXISTS orbit_generation_locks (
    owner TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL
  ) STRICT`,
  `CREATE TABLE IF NOT EXISTS orbit_generation_limits (
    owner TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL
  ) STRICT`,
];
