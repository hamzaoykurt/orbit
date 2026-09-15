import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const connect = readFileSync(new URL('../app/api/google-calendar/connect/route.ts', import.meta.url), 'utf8');
const callback = readFileSync(new URL('../app/api/google-calendar/callback/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0004_google_calendar.sql', import.meta.url), 'utf8');

test('Google Calendar tokens stay on the server and startup restores the server connection', () => {
  assert.doesNotMatch(source, /orbit-google-calendar-session|accessTokenRef|initTokenClient/);
  assert.match(source, /fetch\('\/api\/google-calendar\/status'/);
  assert.match(source, /googleConfig\.connected.*syncGoogleCalendar/s);
});

test('Google authorization requests offline access and consumes one-time state', () => {
  assert.match(connect, /access_type:\s*'offline'/);
  assert.match(connect, /prompt:\s*'consent'/);
  assert.match(callback, /DELETE FROM orbit_google_calendar_oauth_states/);
  assert.match(callback, /encryptRefreshToken\(payload\.refresh_token/);
});

test('persistent calendar credentials are isolated from OAuth state', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS orbit_google_calendar_credentials/);
  assert.match(migration, /refresh_token_ciphertext TEXT NOT NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS orbit_google_calendar_oauth_states/);
});
