import { getDatabase } from '../../db/client';
import { digest } from './server';

// Linking Google Calendar from the native app. The app cannot send its Bearer token to a browser,
// so it asks (POST /api/google-calendar/connect-link) for a one-time URL and opens it in the
// system browser. Both secrets below live in orbit_google_calendar_oauth_states, in their own hash
// domain (SHA-256 of "<domain>:" + value) so a web OAuth `state` can never be replayed as a link
// ticket or app state and vice versa. No schema change.
export const LINK_LIFETIME_SECONDS = 60;
// An app-started OAuth state is bound to the browser that opened the link (cookie below) and lives 5 minutes.
export const APP_STATE_LIFETIME_SECONDS = 5 * 60;
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const now = () => Math.floor(Date.now() / 1000);

export const linkTicketHash = (ticket: string) => digest(`link:${ticket}`);
// The binding (a random value kept only in the browser's cookie) is mixed into the stored hash: a leaked
// state alone cannot be redeemed, it must arrive from the browser that started the flow.
export const appStateHash = (state: string, binding: string) => digest(`app:${state}:${binding}`);

const bindingName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-orbit_gcal_bind' : 'orbit_gcal_bind';
// Lax: Google's redirect back is a top-level GET navigation, which still carries the cookie.
export const bindingCookie = (request: Request, value: string, clear = false) =>
  `${bindingName(request)}=${clear ? '' : value}; Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}; Max-Age=${clear ? 0 : APP_STATE_LIFETIME_SECONDS}`;
export function readBinding(request: Request) {
  const matches = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${bindingName(request)}=`));
  const value = matches.length === 1 ? matches[0].slice(bindingName(request).length + 1) : '';
  return TOKEN_SHAPE.test(value) ? value : null;
}

// Atomically consumes a row: a second call with the same value gets null.
async function take(hashPromise: Promise<string>) {
  const row = await getDatabase().prepare(`DELETE FROM orbit_google_calendar_oauth_states
    WHERE state_hash = ? RETURNING owner, expires_at`).bind(await hashPromise).first<{ owner: string; expires_at: number }>();
  return row && row.expires_at > now() ? row.owner : null;
}
export const takeLinkTicket = (ticket: string) => TOKEN_SHAPE.test(ticket) ? take(linkTicketHash(ticket)) : Promise.resolve(null);
export const takeAppState = (state: string, binding: string | null) => TOKEN_SHAPE.test(state) && binding ? take(appStateHash(state, binding)) : Promise.resolve(null);

export type AppResult = 'connected' | 'denied' | 'failed' | 'expired' | 'config' | 'grant' | 'refresh' | 'scope';
const COPY: Record<AppResult, { status: number; title: string; text: string }> = {
  connected: { status: 200, title: 'Google Takvim bağlandı', text: 'Orbit uygulamasına dönebilirsin. Bu sekmeyi kapatabilirsin.' },
  denied: { status: 200, title: 'İzin verilmedi', text: 'Google Takvim bağlanmadı. İstersen Orbit uygulamasından yeniden deneyebilirsin.' },
  failed: { status: 400, title: 'Bağlantı kurulamadı', text: 'Orbit uygulamasına dönüp Google Takvim bağlantısını yeniden başlat.' },
  // Reasons found while swapping Google's code for tokens. Each tells the person (or the owner) what to fix.
  config: { status: 400, title: 'Google ayarı kabul edilmedi', text: 'Google, sunucudaki OAuth ayarını (istemci kimliği, gizli anahtar veya yönlendirme adresi) kabul etmedi. Orbit sahibinin Google Cloud Console ayarını kontrol etmesi gerekiyor.' },
  grant: { status: 400, title: 'İzin kodu kabul edilmedi', text: 'Google bu izin kodunu reddetti; süresi dolmuş ya da bir kez kullanılmış olabilir. Orbit uygulamasında Google Takvim bağlantısını yeniden başlat.' },
  refresh: { status: 400, title: 'Kalıcı izin alınamadı', text: 'Google kalıcı bağlantı anahtarı vermedi. myaccount.google.com/permissions adresinden Orbit için verdiğin izni kaldırıp bağlantıyı yeniden başlat.' },
  scope: { status: 200, title: 'Takvim izni verilmedi', text: 'Google izin ekranında takvim kutusu işaretlenmeden devam edildi. Bağlantıyı yeniden başlat ve takvim etkinliklerine izin ver.' },
  expired: { status: 410, title: 'Bağlantının süresi doldu', text: 'Bu bağlantı tek kullanımlık ve kısa ömürlü. Orbit uygulamasında Google Takvim bağlantısını yeniden başlat.' },
};
// Static page: no scripts, no external requests, nothing from the URL is echoed back.
export function appReturnPage(result: AppResult, statusOverride?: number) {
  const { status: defaultStatus, title, text } = COPY[result];
  const status = statusOverride ?? defaultStatus;
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>${title} · Orbit</title><style>
:root{--bg:#F5EADA;--card:#FDF8EF;--ink:#1B1035;--muted:#5C5672}@media(prefers-color-scheme:dark){:root{--bg:#14101F;--card:#1E1930;--ink:#F3EEFF;--muted:#B9B2CC}}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--ink);font:16px/1.55 "Segoe UI",Inter,system-ui,sans-serif}
main{width:min(100%,440px);padding:32px 28px;border-radius:24px;background:var(--card)}h1{margin:0 0 10px;font-size:26px;line-height:1.15;letter-spacing:-.02em}p{margin:0;color:var(--muted)}
</style></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' },
  });
}
