import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { googleCalendarConfig } from '../../../../integrations/google-calendar/server';
import { LINK_LIFETIME_SECONDS, linkTicketHash } from '../../../../integrations/google-calendar/app-flow';
import { getDatabase } from '../../../../db/client';

export const dynamic = 'force-dynamic';

// Native app: a Bearer-authenticated POST returns a one-time URL (60 s) for the system browser.
// The browser has no Orbit session, so the ticket in the URL is its only credential.
export async function POST(request: Request) {
  const owner = authenticatedUser();
  if (!owner) return unauthorized();
  if (!googleCalendarConfig().configured) return Response.json({ error: 'Google Takvim sunucu ayarları eksik.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const ticket = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + LINK_LIFETIME_SECONDS;
  const database = getDatabase();
  await database.batch([
    database.prepare('DELETE FROM orbit_google_calendar_oauth_states WHERE expires_at <= ?').bind(now),
    database.prepare('INSERT INTO orbit_google_calendar_oauth_states (state_hash, owner, expires_at) VALUES (?, ?, ?)')
      .bind(await linkTicketHash(ticket), owner, expiresAt),
  ]);
  const url = new URL('/api/google-calendar/connect', request.url);
  url.searchParams.set('link', ticket);
  return Response.json({ url: url.toString(), expiresAt: new Date(expiresAt * 1000).toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
