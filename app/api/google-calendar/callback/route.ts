import { authenticatedUser } from '../../../../auth/context';
import { digest, encryptRefreshToken, googleCalendarConfig } from '../../../../integrations/google-calendar/server';
import { appReturnPage, bindingCookie, readBinding, takeAppState } from '../../../../integrations/google-calendar/app-flow';
import { getDatabase } from '../../../../db/client';

export const dynamic = 'force-dynamic';

const finish = (request: Request, result: 'connected' | 'denied' | 'failed') => {
  const url = new URL('/', request.url);
  url.searchParams.set('view', 'calendar');
  url.searchParams.set('google-calendar', result);
  return new Response(null, { status: 303, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  // Linking started from the native app: its state is bound to that app-started flow AND to the browser
  // that opened the link (binding cookie), not to a web session (the system browser has none). It is
  // consumed here, once, and decides the owner.
  let appOwner: string | null = null;
  let lookupFailed = false;
  try { appOwner = await takeAppState(state, readBinding(request)); } catch { lookupFailed = true; }
  const owner = appOwner ?? authenticatedUser();
  // No web session and no matching app flow (or D1 down): this is the system browser, so answer with a page, not JSON.
  if (!owner) return appReturnPage('failed', lookupFailed ? 503 : 401);
  const done = (result: 'connected' | 'denied' | 'failed') => {
    if (!appOwner) return finish(request, result);
    const page = appReturnPage(result);
    page.headers.append('Set-Cookie', bindingCookie(request, '', true));
    return page;
  };
  if (url.searchParams.get('error')) return done('denied');
  const code = url.searchParams.get('code') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) return done('failed');

  try {
    const database = getDatabase();
    if (!appOwner) {
      const consumed = await database.prepare(`DELETE FROM orbit_google_calendar_oauth_states
        WHERE state_hash = ? RETURNING owner, expires_at`).bind(await digest(state)).first<{ owner: string; expires_at: number }>();
      if (!consumed || consumed.owner !== owner || consumed.expires_at <= Math.floor(Date.now() / 1000)) return done('failed');
    }

    const config = googleCalendarConfig();
    if (!config.configured) return done('failed');
    const redirectUri = new URL('/api/google-calendar/callback', request.url).toString();
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const payload = await response.json().catch(() => ({})) as { refresh_token?: string; scope?: string };
    if (!response.ok || !payload.refresh_token) return done('failed');
    const encrypted = await encryptRefreshToken(payload.refresh_token, owner, config.encryptionSecret);
    await database.prepare(`INSERT INTO orbit_google_calendar_credentials
      (owner, refresh_token_ciphertext, refresh_token_iv, calendar_id, scope, connected_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(owner) DO UPDATE SET refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        refresh_token_iv = excluded.refresh_token_iv, calendar_id = excluded.calendar_id,
        scope = excluded.scope, connected_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
      .bind(owner, encrypted.ciphertext, encrypted.iv, config.calendarId, payload.scope ?? '').run();
    return done('connected');
  } catch (error) {
    console.error('Google Calendar callback failed', error);
    return done('failed');
  }
}
