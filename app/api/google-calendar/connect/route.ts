import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { digest, googleCalendarConfig } from '../../../../integrations/google-calendar/server';
import { getDatabase } from '../../../../db/client';

export const dynamic = 'force-dynamic';
const STATE_LIFETIME_SECONDS = 10 * 60;

export async function GET(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  const config = googleCalendarConfig();
  if (!config.configured) return Response.json({ error: 'Google Takvim sunucu ayarları eksik.' }, { status: 503 });

  const state = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const database = getDatabase();
  await database.batch([
    database.prepare('DELETE FROM orbit_google_calendar_oauth_states WHERE expires_at <= ? OR owner = ?').bind(now, owner),
    database.prepare('INSERT INTO orbit_google_calendar_oauth_states (state_hash, owner, expires_at) VALUES (?, ?, ?)')
      .bind(await digest(state), owner, now + STATE_LIFETIME_SECONDS),
  ]);

  const redirectUri = new URL('/api/google-calendar/callback', request.url).toString();
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  }).toString();
  return new Response(null, { status: 302, headers: { Location: authorize.toString(), 'Cache-Control': 'no-store' } });
}
