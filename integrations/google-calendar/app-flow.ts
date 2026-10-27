import { getDatabase } from '../../db/client';
import { digest } from './server';

// Linking Google Calendar from the native app. The app cannot send its Bearer token to a browser,
// so it asks (POST /api/google-calendar/connect-link) for a one-time URL and opens it in the
// system browser. Both secrets below live in orbit_google_calendar_oauth_states, in their own hash
// domain (SHA-256 of "<domain>:" + value) so a web OAuth `state` can never be replayed as a link
// ticket or app state and vice versa. No schema change.
export const LINK_LIFETIME_SECONDS = 60;
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const now = () => Math.floor(Date.now() / 1000);

export const linkTicketHash = (ticket: string) => digest(`link:${ticket}`);
export const appStateHash = (state: string) => digest(`app:${state}`);

// Atomically consumes a row: a second call with the same value gets null.
async function take(hashPromise: Promise<string>) {
  const row = await getDatabase().prepare(`DELETE FROM orbit_google_calendar_oauth_states
    WHERE state_hash = ? RETURNING owner, expires_at`).bind(await hashPromise).first<{ owner: string; expires_at: number }>();
  return row && row.expires_at > now() ? row.owner : null;
}
export const takeLinkTicket = (ticket: string) => TOKEN_SHAPE.test(ticket) ? take(linkTicketHash(ticket)) : Promise.resolve(null);
export const takeAppState = (state: string) => TOKEN_SHAPE.test(state) ? take(appStateHash(state)) : Promise.resolve(null);

export type AppResult = 'connected' | 'denied' | 'failed' | 'expired';
const COPY: Record<AppResult, { status: number; title: string; text: string }> = {
  connected: { status: 200, title: 'Google Takvim bağlandı', text: 'Orbit uygulamasına dönebilirsin. Bu sekmeyi kapatabilirsin.' },
  denied: { status: 200, title: 'İzin verilmedi', text: 'Google Takvim bağlanmadı. İstersen Orbit uygulamasından yeniden deneyebilirsin.' },
  failed: { status: 400, title: 'Bağlantı kurulamadı', text: 'Orbit uygulamasına dönüp Google Takvim bağlantısını yeniden başlat.' },
  expired: { status: 410, title: 'Bağlantının süresi doldu', text: 'Bu bağlantı tek kullanımlık ve kısa ömürlü. Orbit uygulamasında Google Takvim bağlantısını yeniden başlat.' },
};
// Static page: no scripts, no external requests, nothing from the URL is echoed back.
export function appReturnPage(result: AppResult) {
  const { status, title, text } = COPY[result];
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>${title} · Orbit</title><style>
:root{--bg:#F5EADA;--card:#FDF8EF;--ink:#1B1035;--muted:#5C5672}@media(prefers-color-scheme:dark){:root{--bg:#14101F;--card:#1E1930;--ink:#F3EEFF;--muted:#B9B2CC}}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:16px/1.55 "Segoe UI",Inter,system-ui,sans-serif}
main{width:min(100%,440px);padding:32px 28px;border-radius:24px;background:var(--card)}h1{margin:0 0 10px;font-size:26px;line-height:1.15;letter-spacing:-.02em}p{margin:0;color:var(--muted)}
</style></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
  });
}
