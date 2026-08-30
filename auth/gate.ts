import { timingSafeEqual } from 'node:crypto';
import { authenticatedRequest, unauthorized } from './context';
import { validPasswordHash, verifyPassword } from './password';
import { loginPage } from './login-page';

const DAY = 86_400;
export const REMEMBER_SECONDS = 90 * DAY;
const SESSION_SECONDS = DAY;
const ATTEMPT_WINDOW = 15 * 60;
const PUBLIC_FILES = new Set(['/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest', '/sw.js']);
type Session = { token_hash: string; remembered: number; expires_at: number; refreshed_at: number };
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
function cookie(request: Request, token: string, remembered: boolean, clear = false) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}${clear ? '; Max-Age=0' : remembered ? `; Max-Age=${REMEMBER_SECONDS}` : ''}`;
}
const redirect = (location: string, setCookie?: string) => new Response(null, {
  status: 303, headers: { Location: location, ...(setCookie ? { 'Set-Cookie': setCookie } : {}) },
});
export function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const url = new URL(value, 'https://orbit.invalid');
  if (url.origin !== 'https://orbit.invalid' || /^\/(?:login|auth)(?:\/|$)/.test(url.pathname)) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
function secureResponse(response: Response, setCookie?: string) {
  const secured = new Response(response.body, response);
  secured.headers.set('Cache-Control', 'private, no-store');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('X-Frame-Options', 'DENY');
  // Native form submissions need their same-origin Origin header for CSRF checks.
  secured.headers.set('Referrer-Policy', 'same-origin');
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (setCookie) secured.headers.append('Set-Cookie', setCookie);
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
  const username = form.get('username') ?? '';
  const password = form.get('password') ?? '';
  if (!username || username.length > 64 || !password || password.length > 256) return loginPage({ error: 'Kullanıcı adı veya parola hatalı.', status: 401, next });
  const now = seconds();
  // CF-Connecting-IP is assigned by Cloudflare, not forwarded client identity.
  const key = await hash(`login:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
  const attempt = await env.DB.prepare(`INSERT INTO orbit_auth_attempts (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING attempts, expires_at`).bind(key, now + ATTEMPT_WINDOW, now, now).first<{ attempts: number; expires_at: number }>();
  if (!attempt || attempt.attempts > 10) return loginPage({ error: 'Çok fazla giriş denemesi. Biraz sonra tekrar dene.', status: 429, retryAfter: Math.max(1, (attempt?.expires_at ?? now + ATTEMPT_WINDOW) - now), next });
  const passwordMatches = verifyPassword(password, env.ORBIT_AUTH_PASSWORD_HASH);
  const userMatches = timingSafeEqual(await digest(username), await digest(env.ORBIT_AUTH_USERNAME));
  if (!passwordMatches || !userMatches) return loginPage({ error: 'Kullanıcı adı veya parola hatalı.', status: 401, next });
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const remembered = form.get('remember') === '1';
  const previous = cookieValue(request);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM orbit_auth_sessions WHERE expires_at <= ? OR token_hash = ? OR credential_version != ?').bind(now, previous ? await hash(previous) : '', version),
    env.DB.prepare('DELETE FROM orbit_auth_attempts WHERE expires_at <= ? OR key = ?').bind(now, key),
    env.DB.prepare('INSERT INTO orbit_auth_sessions (token_hash, credential_version, remembered, created_at, refreshed_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await hash(token), version, remembered ? 1 : 0, now, now, now + (remembered ? REMEMBER_SECONDS : SESSION_SECONDS)),
  ]);
  return redirect(next, cookie(request, token, remembered));
}

export async function withAuthentication(request: Request, env: Cloudflare.Env, next: Next): Promise<Response> {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    url.protocol = 'https:';
    return new Response(null, { status: 308, headers: { Location: url.href } });
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
    const session = tokenHash ? await env.DB.prepare('SELECT token_hash, remembered, expires_at, refreshed_at FROM orbit_auth_sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?')
      .bind(tokenHash, version, now).first<Session>() : null;
    if (url.pathname === '/auth/logout') {
      if (request.method !== 'POST') return secureResponse(new Response(null, { status: 405, headers: { Allow: 'POST' } }));
      if (!sameOrigin(request)) return secureResponse(new Response(null, { status: 403 }));
      if (tokenHash) await env.DB.prepare('DELETE FROM orbit_auth_sessions WHERE token_hash = ?').bind(tokenHash).run();
      const response = redirect('/login', cookie(request, '', false, true));
      response.headers.set('Clear-Site-Data', '"cache", "storage"');
      return secureResponse(response);
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
    let refreshedCookie: string | undefined;
    if (session.remembered && now - session.refreshed_at >= DAY) {
      const update = await env.DB.prepare('UPDATE orbit_auth_sessions SET refreshed_at = ?, expires_at = ? WHERE token_hash = ? AND expires_at > ?')
        .bind(now, now + REMEMBER_SECONDS, session.token_hash, now).run();
      if (!update.meta.changes) return secureResponse(unauthorized());
      refreshedCookie = cookie(request, token!, true);
    }
    const response = url.pathname === '/auth/session'
      ? Response.json({ authenticated: true, remembered: Boolean(session.remembered) })
      : await authenticatedRequest.run({ username: env.ORBIT_AUTH_USERNAME }, next);
    return secureResponse(response, refreshedCookie);
  } catch (error) {
    // Never fall through to the app if credentials, hashing or D1 are unavailable.
    console.error('Authentication service unavailable', error instanceof Error ? error.message : 'unknown error');
    return secureResponse(Response.json({ error: 'Giriş hizmetine ulaşılamıyor. Lütfen tekrar dene.' }, { status: 503 }));
  }
}
