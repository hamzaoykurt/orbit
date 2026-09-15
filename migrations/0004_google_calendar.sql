CREATE TABLE IF NOT EXISTS orbit_google_calendar_credentials (
  owner TEXT PRIMARY KEY,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  scope TEXT NOT NULL DEFAULT '',
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS orbit_google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS orbit_google_calendar_oauth_states_expiry
  ON orbit_google_calendar_oauth_states(expires_at);
