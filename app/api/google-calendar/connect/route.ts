import { authenticatedUser, unauthorized } from '../../../../auth/context';
import { digest, googleCalendarConfig } from '../../../../integrations/google-calendar/server';
import { APP_STATE_LIFETIME_SECONDS, appReturnPage, appStateHash, bindingCookie, takeLinkTicket } from '../../../../integrations/google-calendar/app-flow';
import { getDatabase } from '../../../../db/client';

export const dynamic = 'force-dynamic';
const STATE_LIFETIME_SECONDS = 10 * 60;

export async function GET(request: Request) {
  // `?link=` comes from the native app (POST /api/google-calendar/connect-link): a one-time ticket
  // stands in for the web session, which the system browser does not have. That browser is the
  // one that must come back to the callback, so it is marked with a short-lived HttpOnly cookie.
  const link = new URL(request.url).searchParams.get('link');
  try {
    const owner = link === null ? authenticatedUser() : await takeLinkTicket(link);
    if (link !== null && !owner) return appReturnPage('expired');
    if (!owner) return unauthorized();
    const config = googleCalendarConfig();
    if (!config.configured) return link !== null ? appReturnPage('failed', 503) : Response.json({ error: 'Google Takvim sunucu ayarları eksik.' }, { status: 503 });

    const state = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const binding = link !== null ? Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') : null;
    const now = Math.floor(Date.now() / 1000);
    const database = getDatabase();
    await database.batch([
      database.prepare('DELETE FROM orbit_google_calendar_oauth_states WHERE expires_at <= ? OR owner = ?').bind(now, owner),
      database.prepare('INSERT INTO orbit_google_calendar_oauth_states (state_hash, owner, expires_at) VALUES (?, ?, ?)')
        .bind(binding ? await appStateHash(state, binding) : await digest(state), owner, now + (binding ? APP_STATE_LIFETIME_SECONDS : STATE_LIFETIME_SECONDS)),
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
    const headers = new Headers({ Location: authorize.toString(), 'Cache-Control': 'no-store' });
    if (binding) headers.append('Set-Cookie', bindingCookie(request, binding));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    // The system browser must never be left with raw JSON or a stack trace.
    if (link === null) throw error;
    console.error('Google Calendar app link failed', error instanceof Error ? error.message : 'unknown error');
    return appReturnPage('failed', 503);
  }
}
