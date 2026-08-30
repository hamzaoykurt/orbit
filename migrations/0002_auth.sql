CREATE TABLE IF NOT EXISTS orbit_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  credential_version TEXT NOT NULL,
  remembered INTEGER NOT NULL CHECK (remembered IN (0, 1)),
  created_at INTEGER NOT NULL,
  refreshed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orbit_auth_sessions_expiry ON orbit_auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS orbit_auth_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orbit_auth_attempts_expiry ON orbit_auth_attempts(expires_at);
