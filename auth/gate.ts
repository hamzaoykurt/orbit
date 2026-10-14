import { timingSafeEqual } from 'node:crypto';
import { authenticatedRequest, unauthorized } from './context';
import { validPasswordHash, verifyPassword } from './password';
import { loginPage } from './login-page';
import { iconChoice, manifestForIcon } from './manifest-variant';
import { forgetSession, lookupSession, updateCachedSession, type Session } from './session-cache';

const DAY = 86_400;
export const REMEMBER_SECONDS = 90 * DAY;
const SESSION_SECONDS = DAY;
const ATTEMPT_WINDOW = 15 * 60;
const PUBLIC_FILES = new Set([
  '/favicon.svg',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/orbit-favicon-v2.png',
  '/orbit-icon-v2-192.png',
  '/orbit-icon-v2-512.png',
  '/orbit-apple-touch-v2.png',
  '/orbit-favicon-v3.png',
  '/orbit-icon-v3-192.png',
  '/orbit-icon-v3-512.png',
  '/orbit-apple-touch-v3.png',
  '/orbit-favicon-v8.png',
  '/orbit-icon-v8-192.png',
  '/orbit-icon-v8-512.png',
  '/orbit-apple-touch-v8.png',
  '/orbit-mark-v8-96.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/shortcuts/new-task-96.png',
  '/shortcuts/program-96.png',
  '/splash/apple-splash-1170x2532.png',
  '/splash/apple-splash-1290x2796.png',
  '/orbit-icon-dark-v8-192.png',
  '/orbit-icon-dark-v8-512.png',
  '/orbit-favicon-dark-v8.png',
  '/orbit-apple-touch-dark-v8.png',
  '/orbit-mark-dark-v8-96.png',
  '/icon-maskable-dark-v8-192.png',
  '/icon-maskable-dark-v8-512.png',
  '/splash/apple-splash-dark-1170x2532.png',
  '/splash/apple-splash-dark-1290x2796.png',
  '/manifest.webmanifest',
  '/sw.js',
]);
// GET endpoints that change data (OAuth state, account links): never served from the session cache.
const WRITING_GETS = new Set(['/api/google-calendar/connect', '/api/google-calendar/callback', '/api/integrations/profitness/connect']);
type Next = () => Promise<Response>;
const seconds = () => Math.floor(Date.now() / 1000);
const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const hash = async (value: string) => Buffer.from(await digest(value)).toString('hex');
const cookieName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-orbit_session' : 'orbit_session';
const cookieValue = (request: Request) => {
  const matches = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${cookieName(request)}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(cookieName(request).length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
};
function cookie(request: Request, token: string, remembered: boolean, clear = false, expiresAt = seconds() + REMEMBER_SECONDS) {
  // Installed-app launches can start outside the site's browsing context.
  // Lax permits their top-level GET; all mutations still require sameOrigin().
  const lifetime = clear ? '; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    : remembered ? `; Max-Age=${Math.max(0, expiresAt - seconds())}; Expires=${new Date(expiresAt * 1000).toUTCString()}` : '';
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}${lifetime}`;
}
// Readable (non-HttpOnly) copy of the session's END TIME only: no token, no data. The page
// reads it before painting, so a device whose session has lapsed never shows the local
// workspace copy (the app shell may open offline from the service worker).
const markName = (request: Request) => new URL(request.url).protocol === 'https:' ? '__Host-orbit_exp' : 'orbit_exp';
function expiryMark(request: Request, expiresAt: number, remembered: boolean, clear = false) {
  const lifetime = clear ? '; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    : remembered ? `; Max-Age=${Math.max(0, expiresAt - seconds())}; Expires=${new Date(expiresAt * 1000).toUTCString()}` : '';
  return `${markName(request)}=${clear ? '' : expiresAt}; Path=/; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}${lifetime}`;
}
const redirect = (location: string, setCookie?: string | string[]) => {
  const response = new Response(null, { status: 303, headers: { Location: location } });
  for (const value of [setCookie ?? []].flat()) response.headers.append('Set-Cookie', value);
  return response;
};
export function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const url = new URL(value, 'https://orbit.invalid');
  if (url.origin !== 'https://orbit.invalid' || /^\/(?:login|auth)(?:\/|$)/.test(url.pathname)) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
function secureResponse(response: Response, setCookie?: string | string[], immutableAsset = false) {
  const secured = new Response(response.body, response);
  // Content-hashed bundles are application code, not user data. They still need a
  // session on first fetch, but the browser may reuse them (never a shared cache).
  secured.headers.set('Cache-Control', immutableAsset ? 'private, max-age=31536000, immutable' : 'private, no-store');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('X-Frame-Options', 'DENY');
  // Native form submissions need their same-origin Origin header for CSRF checks.
  secured.headers.set('Referrer-Policy', 'same-origin');
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow');
  for (const value of [setCookie ?? []].flat()) secured.headers.append('Set-Cookie', value);
  return secured;
}
function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
async function readForm(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return null;
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
async function login(request: Request, env: Cloudflare.Env, version: string) {
  if (!sameOrigin(request)) return new Response('Geçersiz istek kaynağı.', { status: 403 });
  const form = await readForm(request);
  if (!form) return loginPage({ error: 'Geçerli giriş bilgilerini gönder.', status: 400 });
  const next = safeNext(form.get('next'));
  const remembered = form.get('remember') === '1';
  const username = form.get('username') ?? '';
  const password = form.get('password') ?? '';
  if (!username || username.length > 64 || !password || password.length > 256) return loginPage({ error: 'Kullanıcı adı veya parola hatalı.', status: 401, next, remembered });
  const now = seconds();
  // CF-Connecting-IP is assigned by Cloudflare, not forwarded client identity.
  const key = await hash(`login:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
  const attempt = await env.DB.prepare(`INSERT INTO orbit_auth_attempts (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING attempts, expires_at`).bind(key, now + ATTEMPT_WINDOW, now, now).first<{ attempts: number; expires_at: number }>();
  if (!attempt || attempt.attempts > 10) return loginPage({ error: 'Çok fazla giriş denemesi. Biraz sonra tekrar dene.', status: 429, retryAfter: Math.max(1, (attempt?.expires_at ?? now + ATTEMPT_WINDOW) - now), next, remembered });
  const passwordMatches = verifyPassword(password, env.ORBIT_AUTH_PASSWORD_HASH);
  const userMatches = timingSafeEqual(await digest(username), await digest(env.ORBIT_AUTH_USERNAME));
  if (!passwordMatches || !userMatches) return loginPage({ error: 'Kullanıcı adı veya parola hatalı.', status: 401, next, remembered });
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const previous = cookieValue(request);
  const expiresAt = now + (remembered ? REMEMBER_SECONDS : SESSION_SECONDS);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM orbit_auth_sessions WHERE expires_at <= ? OR token_hash = ? OR credential_version != ?').bind(now, previous ? await hash(previous) : '', version),
    env.DB.prepare('DELETE FROM orbit_auth_attempts WHERE expires_at <= ? OR key = ?').bind(now, key),
    env.DB.prepare('INSERT INTO orbit_auth_sessions (token_hash, credential_version, remembered, created_at, refreshed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await hash(token), version, remembered ? 1 : 0, now, now, expiresAt),
  ]);
  forgetSession(previous ? await hash(previous) : null);
  return redirect(next, [cookie(request, token, remembered), expiryMark(request, expiresAt, remembered)]);
}

type Timing = { session: number; source: string; appStart: number; appEnd: number };
// Server-Timing carries durations (ms) and a hit/miss label only, never data.
export async function withAuthentication(request: Request, env: Cloudflare.Env, next: Next): Promise<Response> {
  const started = Date.now();
  const timing: Timing = { session: 0, source: 'none', appStart: 0, appEnd: 0 };
  const response = await authenticate(request, env, next, timing);
  try {
    const app = timing.appStart ? Math.max(0, timing.appEnd - timing.appStart) : 0;
    response.headers.set('Server-Timing', `session;dur=${timing.session};desc="${timing.source}", app;dur=${app}, total;dur=${Date.now() - started}`);
  } catch { /* Immutable response: skip the diagnostic header. */ }
  return response;
}

async function authenticate(request: Request, env: Cloudflare.Env, next: Next, timing: Timing): Promise<Response> {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    url.protocol = 'https:';
    return new Response(null, { status: 308, headers: { Location: url.href } });
  }
  if (url.pathname === '/manifest.webmanifest' && ['GET', 'HEAD'].includes(request.method)) {
    // Public like before, but the icon set follows the user's choice (cookie or ?icon=).
    const asset = await env.ASSETS.fetch(request);
    if (!asset.ok) return secureResponse(asset);
    const body = manifestForIcon(await asset.text(), iconChoice(url, request.headers.get('cookie')));
    const variant = new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', Vary: 'Cookie' } });
    return secureResponse(variant);
  }
  if (PUBLIC_FILES.has(url.pathname) && ['GET', 'HEAD'].includes(request.method)) {
    const response = await env.ASSETS.fetch(request);
    // In particular, a stale service worker must be replaced promptly.
    return secureResponse(response);
  }
  try {
    if (!env.ORBIT_AUTH_USERNAME || !validPasswordHash(env.ORBIT_AUTH_PASSWORD_HASH)) {
      const error = 'Giriş henüz yapılandırılmadı. Çalışma alanı güvenlik için kapalı.';
      return secureResponse(url.pathname.startsWith('/api/') ? Response.json({ error }, { status: 503 }) : loginPage({ configured: false, status: 503, error }));
    }
    const version = await hash(`${env.ORBIT_AUTH_USERNAME}:${env.ORBIT_AUTH_PASSWORD_HASH}`);
    if (url.pathname === '/auth/login') {
      if (request.method !== 'POST') return secureResponse(new Response(null, { status: 405, headers: { Allow: 'POST' } }));
      return secureResponse(await login(request, env, version));
    }
    const token = cookieValue(request);
    const tokenHash = token ? await hash(token) : null;
    const now = seconds();
    if (url.pathname === '/auth/logout') {
      if (request.method !== 'POST') return secureResponse(new Response(null, { status: 405, headers: { Allow: 'POST' } }));
      if (!sameOrigin(request)) return secureResponse(new Response(null, { status: 403 }));
      forgetSession(tokenHash);
      if (tokenHash) await env.DB.prepare('DELETE FROM orbit_auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
      // A request that read the session while the DELETE was running may have re-cached it.
      forgetSession(tokenHash);
      const response = redirect('/login', [cookie(request, '', false, true), expiryMark(request, 0, false, true)]);
      response.headers.set('Clear-Site-Data', '"cache", "storage"');
      return secureResponse(response);
    }
    const isStatic = url.pathname.startsWith('/_next/static/');
    const withState = request.method === 'GET' && url.pathname === '/api/state';
    let session: Session | null = null;
    let stateRow: unknown;
    if (tokenHash) {
      const lookupStart = Date.now();
      // Reads may reuse a lookup that is at most a few seconds old (session-cache.ts);
      // anything that changes data re-checks D1 every time.
      const found = await lookupSession(env, { tokenHash, version, now, fresh: !['GET', 'HEAD', 'OPTIONS'].includes(request.method) || WRITING_GETS.has(url.pathname), withState });
      timing.session = Date.now() - lookupStart;
      timing.source = found.source;
      session = found.session;
      if (withState) stateRow = found.stateRow;
    }
    if (url.pathname === '/login') {
      if (!['GET', 'HEAD'].includes(request.method)) return secureResponse(new Response(null, { status: 405 }));
      return secureResponse(session ? redirect(safeNext(url.searchParams.get('next'))) : loginPage({ next: safeNext(url.searchParams.get('next')) }));
    }
    if (!session) {
      const isPage = request.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/') && !request.headers.has('rsc') && !url.searchParams.has('_rsc') && (request.headers.get('accept')?.includes('text/html') || url.pathname === '/');
      return secureResponse(isPage ? redirect(`/login${url.pathname === '/' && !url.search ? '' : `?next=${encodeURIComponent(safeNext(url.pathname + url.search))}`}`) : unauthorized());
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return secureResponse(new Response('Geçersiz istek kaynağı.', { status: 403 }));
    let refreshedCookie: string[] | undefined;
    // Hashed bundles never renew the session or carry a cookie: they stay cacheable.
    if (!isStatic && session.remembered && now - session.refreshed_at >= DAY) {
      const update = await env.DB.prepare('UPDATE orbit_auth_sessions SET refreshed_at = ?, expires_at = ? WHERE token_hash = ? AND expires_at > ?')
        .bind(now, now + REMEMBER_SECONDS, session.token_hash, now).run();
      if (!update.meta.changes) { forgetSession(session.token_hash); return secureResponse(unauthorized()); }
      updateCachedSession(session.token_hash, { refreshed_at: now, expires_at: now + REMEMBER_SECONDS });
      refreshedCookie = [cookie(request, token!, true), expiryMark(request, now + REMEMBER_SECONDS, true)];
    }
    if (!refreshedCookie && (url.pathname === '/auth/session' || (request.method === 'GET' && (url.pathname === '/' || request.headers.get('sec-fetch-dest') === 'document')))) {
      // Upgrade existing Strict cookies without extending the database expiry.
      refreshedCookie = [cookie(request, token!, Boolean(session.remembered), false, session.expires_at), expiryMark(request, session.expires_at, Boolean(session.remembered))];
    }
    timing.appStart = Date.now();
    const response = url.pathname === '/auth/session'
      ? Response.json({ authenticated: true, remembered: Boolean(session.remembered) })
      : await authenticatedRequest.run({ username: env.ORBIT_AUTH_USERNAME, ...(withState ? { stateRow } : {}) }, next);
    timing.appEnd = Date.now();
    const hashedAsset = request.method === 'GET' && response.status === 200 && isStatic && !refreshedCookie;
    const secured = secureResponse(response, refreshedCookie, hashedAsset);
    // Tells the service worker this is the authenticated app shell (safe to keep on the device).
    if (request.method === 'GET' && url.pathname === '/' && secured.status === 200 && /text\/html/i.test(secured.headers.get('Content-Type') ?? '')) secured.headers.set('X-Orbit-Shell', '1');
    return secured;
  } catch (error) {
    // Never fall through to the app if credentials, hashing or D1 are unavailable.
    console.error('Authentication service unavailable', error instanceof Error ? error.message : 'unknown error');
    return secureResponse(Response.json({ error: 'Giriş hizmetine ulaşılamıyor. Lütfen tekrar dene.' }, { status: 503 }));
  }
}
