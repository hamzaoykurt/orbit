import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, scryptSync } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Native-app token sign-in (POST /auth/token, Authorization: Bearer) against the REAL gate and the REAL
// route modules inside workerd. Only Google's token endpoint is faked (outboundService).
const password = 'test-password-only-DO-NOT-DEPLOY';
const salt = Buffer.alloc(16, 9);
const passwordHash = `scrypt:16384:8:5:${salt.toString('hex')}:${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5 }).toString('hex')}`;
const origin = 'https://os.cosmibit.com';
const day = 86400;
const stateKey = 'app-token-test';
let mf, database;
const googleCalls = [];
const calendarCalls = [];
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `import {withAuthentication} from './auth/gate'; import {authenticatedUser,bearerRequest} from './auth/context';
        import * as state from './app/api/state/route'; import * as ideas from './app/api/ideas/route'; import * as quiz from './app/api/research-quiz/route';
        import * as hub from './app/api/hub/analyze/route'; import * as organize from './app/api/organize/route'; import * as media from './app/api/project-media/route'; import * as gStatus from './app/api/google-calendar/status/route';
        import * as gConnect from './app/api/google-calendar/connect/route'; import * as gLink from './app/api/google-calendar/connect-link/route';
        import * as gCallback from './app/api/google-calendar/callback/route'; import * as gDisconnect from './app/api/google-calendar/disconnect/route'; import * as gEvents from './app/api/google-calendar/events/route';
        const routes = {'/api/state':state,'/api/ideas':ideas,'/api/research-quiz':quiz,'/api/hub/analyze':hub,'/api/organize':organize,'/api/project-media':media,'/api/google-calendar/status':gStatus,
          '/api/google-calendar/connect':gConnect,'/api/google-calendar/connect-link':gLink,'/api/google-calendar/callback':gCallback,'/api/google-calendar/events':gEvents,'/api/google-calendar/disconnect':gDisconnect,
          '/__who':{GET:()=>Response.json({user:authenticatedUser(),bearer:bearerRequest()})}};
        export default {fetch(request,env){env.ASSETS={fetch:async()=>new Response('public-icon')};
          return withAuthentication(request,env,async()=>{const handler=routes[new URL(request.url).pathname]?.[request.method];return handler?handler(request):new Response('not found',{status:404})})}};`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    platform: 'node', format: 'esm', bundle: true, write: false, external: ['cloudflare:workers'],
  });
  mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    bindings: { ORBIT_AUTH_USERNAME: 'emir', ORBIT_AUTH_PASSWORD_HASH: passwordHash, GOOGLE_OAUTH_CLIENT_ID: 'test-client', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret', GOOGLE_TOKEN_ENCRYPTION_KEY: stateKey },
    outboundService: async fake => {
      const url = new URL(fake.url);
      if (url.pathname.startsWith('/calendar/v3/')) {
        calendarCalls.push({ url: fake.url, method: fake.method, auth: fake.headers.get('authorization') });
        return fake.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(fake.method === 'POST' ? { id: 'ev-created' } : { items: [{ id: 'ev-listed' }] });
      }
      if (url.pathname === '/revoke') { calendarCalls.push({ url: fake.url, method: fake.method }); return new Response('{}'); }
      const body = new URLSearchParams(await fake.text());
      if (body.get('grant_type') === 'refresh_token') { calendarCalls.push({ url: fake.url, method: fake.method, refresh: true }); return Response.json({ access_token: 'access-test', expires_in: 3600 }); }
      googleCalls.push({ url: fake.url, code: body.get('code'), redirect: body.get('redirect_uri') });
      return Response.json({ refresh_token: 'refresh-test-value', scope: 'calendar.events' });
    },
  });
  database = await mf.getD1Database('DB');
  for (const file of ['0001_orbit_state.sql', '0002_auth.sql', '0004_google_calendar.sql']) {
    await database.batch(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').split(';').map(query => query.trim()).filter(Boolean).map(query => database.prepare(query)));
  }
});
after(async () => { await mf?.dispose(); });

// Every request gets its own client address unless it names one, so per-client budgets never bleed between tests.
const request = (path, options = {}) => mf.dispatchFetch(origin + path, { redirect: 'manual', ...options, headers: { 'cf-connecting-ip': nextIp(), ...options.headers } });
let ip = 1;
const nextIp = () => `198.18.0.${ip++}`;
const tokenRequest = (body = { username: 'emir', password }, headers = {}) => request('/auth/token', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': nextIp(), ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
const issue = async () => { const response = await tokenRequest({ username: 'emir', password, device: 'test-phone' }); assert.equal(response.status, 200); return response.json(); };
const bearer = token => ({ authorization: `Bearer ${token}` });
const appHash = token => createHash('sha256').update(`app-token:${token}`).digest('hex');
const row = token => database.prepare('SELECT * FROM orbit_auth_sessions WHERE token_hash = ?').bind(appHash(token)).first();
const webLogin = (headers = {}) => request('/auth/login', {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': nextIp(), ...headers },
  body: new URLSearchParams({ username: 'emir', password, remember: '1' }).toString(),
});
const cookieOf = response => response.headers.get('set-cookie').split(';')[0];

test('POST /auth/token returns a 90-day token, sets no cookie and stores only a domain-separated hash', async () => {
  const response = await tokenRequest({ username: 'emir', password, device: 'Pixel 8' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const { token, expiresAt } = await response.json();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const stored = await row(token);
  assert.equal(stored.remembered, 1);
  assert.equal(stored.expires_at - stored.created_at, 90 * day);
  assert.equal(new Date(expiresAt).getTime() / 1000, stored.expires_at);
  assert.equal(JSON.stringify(stored).includes(token), false);
  // The plain SHA-256 of the token (the cookie scheme) matches nothing: the two kinds cannot be swapped.
  assert.equal(await database.prepare('SELECT 1 AS found FROM orbit_auth_sessions WHERE token_hash = ?').bind(createHash('sha256').update(token).digest('hex')).first(), null);
});

test('wrong, missing and malformed credentials fail with the cookie login messages and never issue a token', async () => {
  for (const body of [{ username: 'emir', password: 'wrong' }, { username: 'other', password }, { username: 'emir' }, { password }, { username: 'emir', password: 5 }, { username: '', password }, { username: 'e'.repeat(65), password }, { username: 'emir', password: 'x'.repeat(257) }]) {
    const response = await tokenRequest(body);
    assert.equal(response.status, 401, JSON.stringify(Object.keys(body)));
    assert.deepEqual(await response.json(), { error: 'Kullanıcı adı veya parola hatalı.' });
    assert.equal(response.headers.get('set-cookie'), null);
  }
  for (const [body, headers] of [['{not json', {}], ['[]', {}], ['null', {}], [JSON.stringify({ username: 'emir', password }), { 'content-type': 'text/plain' }],
    [JSON.stringify({ username: 'emir', password }), { 'content-type': 'application/x-www-form-urlencoded' }], [JSON.stringify({ username: 'emir', password, device: 7 }), {}],
    [JSON.stringify({ username: 'emir', password, device: 'd'.repeat(65) }), {}], [JSON.stringify({ username: 'emir', password: 'x'.repeat(5000) }), {}]]) {
    const response = await tokenRequest(body, headers);
    assert.equal(response.status, 400, String(body).slice(0, 30));
    assert.deepEqual(await response.json(), { error: 'Geçerli giriş bilgilerini gönder.' });
  }
  assert.equal((await request('/auth/token')).status, 405);
  assert.equal((await request('/auth/token', { method: 'PUT' })).status, 405);
});

test('the attempt limit applies to the token endpoint, before password checking, and is shared with the web form', async () => {
  const attacker = '203.0.113.77';
  for (let i = 0; i < 11; i++) {
    const response = await tokenRequest({ username: 'emir', password: 'wrong' }, { 'cf-connecting-ip': attacker });
    assert.equal(response.status, i < 10 ? 401 : 429, `attempt ${i + 1}`);
    if (i === 10) { assert.ok(Number(response.headers.get('retry-after')) > 0); assert.match((await response.json()).error, /Çok fazla giriş denemesi/); }
  }
  // Even the right password is refused while locked, on both doors.
  assert.equal((await tokenRequest({ username: 'emir', password }, { 'cf-connecting-ip': attacker })).status, 429);
  assert.equal((await webLogin({ 'cf-connecting-ip': attacker })).status, 429);
  // Another client is unaffected; a successful sign-in clears that client's budget.
  const patient = '203.0.113.78';
  for (let i = 0; i < 5; i++) await tokenRequest({ username: 'emir', password: 'wrong' }, { 'cf-connecting-ip': patient });
  assert.equal((await tokenRequest({ username: 'emir', password }, { 'cf-connecting-ip': patient })).status, 200);
  assert.equal(await database.prepare('SELECT 1 FROM orbit_auth_attempts WHERE key = ?').bind(createHash('sha256').update('login:' + patient).digest('hex')).first(), null, 'success clears the budget');
});

test('Bearer reaches /api/state GET and PUT without Origin and without ever receiving a cookie', async () => {
  const { token } = await issue();
  const who = await request('/__who', { headers: bearer(token) });
  assert.deepEqual(await who.json(), { user: 'emir', bearer: true });
  assert.equal(who.headers.get('set-cookie'), null);
  const empty = await request('/api/state', { headers: bearer(token) });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { state: null, revision: 0, updatedAt: null });
  const saved = await request('/api/state', { method: 'PUT', headers: { ...bearer(token), 'content-type': 'application/json' }, body: JSON.stringify({ state: { tasks: [{ id: 'a' }] }, revision: 0 }) });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('set-cookie'), null);
  assert.equal((await saved.json()).revision, 1);
  const read = await (await request('/api/state', { headers: bearer(token) })).json();
  assert.deepEqual(read.state, { tasks: [{ id: 'a' }] });
  assert.equal(read.revision, 1);
  const stale = await request('/api/state', { method: 'PUT', headers: { ...bearer(token), 'content-type': 'application/json' }, body: JSON.stringify({ state: { tasks: [] }, revision: 0 }) });
  assert.equal(stale.status, 409);
  // The Origin check that already existed in the route still rejects a foreign Origin, Bearer or not.
  const foreign = await request('/api/state', { method: 'PUT', headers: { ...bearer(token), origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ state: {}, revision: 1 }) });
  assert.equal(foreign.status, 403);
});

test('other API routes accept Bearer: ideas and research-quiz no longer demand an Origin, cookies still do', async () => {
  const { token } = await issue();
  const json = { 'content-type': 'application/json' };
  // 400 = past the origin gate, rejected by the route's own validation.
  assert.equal((await request('/api/ideas', { method: 'POST', headers: { ...bearer(token), ...json }, body: '{"action":"nope"}' })).status, 400);
  assert.equal((await request('/api/research-quiz', { method: 'POST', headers: { ...bearer(token), ...json }, body: '{}' })).status, 400);
  assert.equal((await request('/api/hub/analyze', { method: 'POST', headers: { ...bearer(token), ...json }, body: '{}' })).status, 400);
  assert.equal((await request('/api/organize', { method: 'POST', headers: { ...bearer(token), ...json }, body: '{}' })).status, 400);
  assert.equal((await request('/api/ideas', { headers: bearer(token) })).status, 200);
  assert.equal((await request('/api/project-media?key=x', { headers: bearer(token) })).status, 503, 'authenticated; the test worker has no KV binding');
  assert.equal((await request('/api/project-media', { method: 'POST', headers: { ...bearer(token), 'content-type': 'image/png' }, body: 'x' })).status, 503, 'past the Origin gate; no KV in the test worker');
  assert.equal((await request('/api/google-calendar/status', { headers: bearer(token) })).status, 200);
  assert.equal((await request('/api/google-calendar/events?timeMin=x&timeMax=y', { headers: bearer(token) })).status, 400);
  // Bearer with a foreign Origin is still refused by those routes.
  for (const path of ['/api/ideas', '/api/research-quiz']) {
    assert.equal((await request(path, { method: 'POST', headers: { ...bearer(token), ...json, origin: 'https://evil.example' }, body: '{}' })).status, 403, path);
  }
  const cookie = cookieOf(await webLogin());
  for (const path of ['/api/ideas', '/api/research-quiz']) {
    assert.equal((await request(path, { method: 'POST', headers: { cookie, ...json }, body: '{}' })).status, 403, `${path} cookie without Origin`);
    assert.equal((await request(path, { method: 'POST', headers: { cookie, ...json, origin }, body: '{"action":"nope"}' })).status, 400, `${path} cookie with Origin`);
  }
});

test('no, malformed, unknown, expired, rotated and swapped-kind tokens are all 401', async () => {
  const { token } = await issue();
  const cookie = cookieOf(await webLogin());
  const cookieValue = cookie.split('=')[1];
  const cases = {
    none: {}, empty: { authorization: 'Bearer ' }, malformed: { authorization: 'Bearer abc' }, tooLong: { authorization: `Bearer ${'a'.repeat(44)}` },
    unknown: bearer('A'.repeat(43)), basic: { authorization: 'Basic dXNlcjpwYXNz' }, twoValues: { authorization: `Bearer ${token} ${token}` },
    cookieValueAsBearer: bearer(cookieValue), bearerAsCookie: { cookie: `__Host-orbit_session=${token}` },
    badBearerWithGoodCookie: { ...bearer('A'.repeat(43)), cookie },
    malformedBearerWithGoodCookie: { authorization: 'Bearer abc', cookie },
  };
  for (const [name, headers] of Object.entries(cases)) {
    const response = await request('/api/state', { headers });
    assert.equal(response.status, 401, name);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await response.json(), { error: 'Devam etmek için giriş yapmalısın.' });
  }
  assert.equal((await request('/api/state', { method: 'PUT', headers: { ...bearer('A'.repeat(43)), 'content-type': 'application/json' }, body: '{}' })).status, 401);
  // Expired and password-rotated (credential_version) tokens.
  for (const assignment of ['expires_at = 1', "credential_version = 'old-password'"]) {
    const fresh = (await issue()).token;
    await database.prepare(`UPDATE orbit_auth_sessions SET ${assignment} WHERE token_hash = ?`).bind(appHash(fresh)).run();
    assert.equal((await request('/api/state', { method: 'PUT', headers: { ...bearer(fresh), 'content-type': 'application/json' }, body: '{}' })).status, 401, assignment);
    assert.equal((await request('/api/state', { headers: bearer(fresh) })).status, 401, assignment);
  }
  // The good token was never disturbed by any of that.
  assert.equal((await request('/api/state', { headers: bearer(token) })).status, 200);
});

test('POST /auth/token/revoke ends the token at once, only for Bearer, and leaves cookie sessions alone', async () => {
  const { token } = await issue();
  const other = (await issue()).token;
  const cookie = cookieOf(await webLogin());
  assert.equal((await request('/auth/token/revoke', { headers: bearer(token) })).status, 405);
  assert.equal((await request('/auth/token/revoke', { method: 'POST' })).status, 401);
  assert.equal((await request('/auth/token/revoke', { method: 'POST', headers: { cookie, origin } })).status, 401, 'a cookie cannot use the token door');
  assert.equal((await request('/api/state', { headers: { cookie } })).status, 200);
  // Warm the cache with a read, then revoke: the same isolate must forget it immediately.
  const warm = await request('/api/state', { headers: bearer(token) });
  assert.equal(warm.status, 200);
  await request('/api/state', { headers: bearer(token) });
  const revoked = await request('/auth/token/revoke', { method: 'POST', headers: bearer(token) });
  assert.equal(revoked.status, 200);
  assert.deepEqual(await revoked.json(), { revoked: true });
  assert.equal(revoked.headers.get('set-cookie'), null);
  assert.equal(await row(token), null);
  for (const method of ['GET', 'PUT']) assert.equal((await request('/api/state', { method, headers: { ...bearer(token), 'content-type': 'application/json' }, body: method === 'PUT' ? '{}' : undefined })).status, 401, method);
  assert.equal((await request('/auth/token/revoke', { method: 'POST', headers: bearer(token) })).status, 401, 'second revoke');
  // Other tokens and the web cookie are unaffected.
  assert.equal((await request('/api/state', { headers: bearer(other) })).status, 200);
  assert.equal((await request('/api/state', { headers: { cookie } })).status, 200);
});

test('Paket D session cache: a token revoked in another isolate is honoured for reads for at most the cache window, never for writes', async () => {
  const { token } = await issue();
  assert.equal((await request('/api/state', { headers: bearer(token) })).status, 200);
  const hit = await request('/api/state', { headers: bearer(token) });
  assert.match(hit.headers.get('server-timing'), /desc="hit"/);
  // Simulates logout handled by a DIFFERENT isolate: D1 changes, this isolate's cache does not.
  await database.prepare('DELETE FROM orbit_auth_sessions WHERE token_hash = ?').bind(appHash(token)).run();
  assert.equal((await request('/api/state', { headers: bearer(token) })).status, 200, 'read still inside the 30 s window (documented bound)');
  assert.equal((await request('/api/state', { method: 'PUT', headers: { ...bearer(token), 'content-type': 'application/json' }, body: '{}' })).status, 401, 'writes re-check D1');
  assert.equal((await request('/api/state', { headers: bearer(token) })).status, 401, 'and the failed re-check evicts the entry');
});

test('Bearer sessions slide forward like remember-me, reporting the new end in a header (never a cookie)', async () => {
  const { token } = await issue();
  const now = Math.floor(Date.now() / 1000);
  await database.prepare('UPDATE orbit_auth_sessions SET refreshed_at = ?, expires_at = ? WHERE token_hash = ?').bind(now - 2 * day, now + 80 * day, appHash(token)).run();
  const response = await request('/auth/session', { headers: bearer(token) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const header = response.headers.get('x-orbit-token-expires-at');
  assert.ok(new Date(header).getTime() / 1000 >= now + 90 * day - 2);
  const body = await response.json();
  assert.equal(body.authenticated, true);
  assert.equal(body.expiresAt, header);
  assert.equal((await row(token)).expires_at, Math.floor(new Date(header).getTime() / 1000));
  // No header when nothing was extended; /auth/session still reports the end time.
  const again = await request('/auth/session', { headers: bearer(token) });
  assert.equal(again.headers.get('x-orbit-token-expires-at'), null);
  assert.equal((await again.json()).expiresAt, header);
});

test('cookie behaviour is unchanged: same /auth/session shape, cookie CSRF rules and cookie refresh', async () => {
  const login = await webLogin();
  assert.equal(login.status, 303);
  const cookie = cookieOf(login);
  const session = await request('/auth/session', { headers: { cookie } });
  assert.deepEqual(await session.json(), { authenticated: true, remembered: true });
  assert.match(session.headers.get('set-cookie'), /__Host-orbit_session=/);
  assert.equal(session.headers.get('x-orbit-token-expires-at'), null);
  assert.equal((await request('/api/state', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await request('/api/state', { method: 'PUT', headers: { cookie, origin: 'https://evil.example' }, body: '{}' })).status, 403);
  const who = await (await request('/__who', { headers: { cookie } })).json();
  assert.deepEqual(who, { user: 'emir', bearer: false });
  // Signing the web session out does not touch app tokens (and vice versa).
  const { token } = await issue();
  assert.equal((await request('/auth/logout', { method: 'POST', headers: { cookie, origin } })).status, 303);
  assert.equal((await request('/api/state', { headers: { cookie } })).status, 401);
  assert.equal((await request('/api/state', { headers: bearer(token) })).status, 200);
});

// Runs the app-side Google link up to (not including) the callback. The browser keeps the binding cookie.
async function startAppLink(token, headers = {}) {
  const minted = await request('/api/google-calendar/connect-link', { method: 'POST', headers: bearer(token) });
  assert.equal(minted.status, 200);
  const link = new URL((await minted.json()).url);
  const start = await request(link.pathname + link.search, { headers });
  return { link, start, binding: start.headers.get('set-cookie')?.split(';')[0], state: start.status === 302 ? new URL(start.headers.get('location')).searchParams.get('state') : null };
}
const connectGoogle = async token => {
  const { state, binding } = await startAppLink(token);
  const done = await request(`/api/google-calendar/callback?code=auth-code-x&state=${state}`, { headers: { cookie: binding } });
  assert.equal(done.status, 200);
};

test('Google linking from the app: one-time 60 s link, browser-bound 5 min state, app return page, no replay', async () => {
  const { token } = await issue();
  assert.equal((await request('/api/google-calendar/connect-link')).status, 401, 'no GET');
  assert.equal((await request('/api/google-calendar/connect-link', { method: 'POST' })).status, 401);
  const minted = await request('/api/google-calendar/connect-link', { method: 'POST', headers: bearer(token) });
  assert.equal(minted.status, 200);
  const { url, expiresAt } = await minted.json();
  const link = new URL(url);
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, '/api/google-calendar/connect');
  assert.match(link.searchParams.get('link'), /^[A-Za-z0-9_-]{43}$/);
  const ttl = new Date(expiresAt).getTime() / 1000 - Date.now() / 1000;
  assert.ok(ttl > 55 && ttl <= 60, `ttl ${ttl}`);
  assert.equal(JSON.stringify(await database.prepare('SELECT * FROM orbit_google_calendar_oauth_states').all()).includes(link.searchParams.get('link')), false, 'only a hash is stored');

  // The system browser has no cookie and no token: the ticket alone starts the OAuth leg.
  const start = await request(link.pathname + link.search);
  assert.equal(start.status, 302);
  const google = new URL(start.headers.get('location'));
  assert.equal(google.origin + google.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(google.searchParams.get('redirect_uri'), origin + '/api/google-calendar/callback');
  const state = google.searchParams.get('state');
  // The state is bound to this browser by a short-lived HttpOnly cookie and lives 5 minutes.
  const header = start.headers.get('set-cookie');
  for (const setting of ['__Host-orbit_gcal_bind=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=300']) assert.ok(header.includes(setting), setting);
  const binding = header.split(';')[0];
  const lifetime = (await database.prepare('SELECT MAX(expires_at) AS e FROM orbit_google_calendar_oauth_states').first()).e - Date.now() / 1000;
  assert.ok(lifetime > 295 && lifetime <= 300, `state lifetime ${lifetime}`);
  assert.equal(JSON.stringify(await database.prepare('SELECT * FROM orbit_google_calendar_oauth_states').all()).includes(binding.split('=')[1]), false, 'binding value is never stored');
  // One-time: the same link cannot start a second flow.
  const replay = await request(link.pathname + link.search);
  assert.equal(replay.status, 410);
  assert.match(await replay.text(), /süresi doldu/);

  // Not redeemable without the browser's binding (leaked state), nor with someone else's, nor with a web-style state.
  const callbackPath = `/api/google-calendar/callback?code=auth-code-1&state=${state}`;
  const grants = googleCalls.length;
  for (const [name, headers] of [['no cookie', {}], ['other browser', { cookie: `__Host-orbit_gcal_bind=${'Z'.repeat(43)}` }]]) {
    const refused = await request(callbackPath, { headers });
    assert.equal(refused.status, 401, name);
    assert.match(refused.headers.get('content-type'), /text\/html/, `${name}: a page, never raw JSON`);
    assert.match(await refused.text(), /Bağlantı kurulamadı/);
  }
  assert.equal((await request(`/api/google-calendar/callback?code=c0de&state=${'B'.repeat(43)}`, { headers: { cookie: binding } })).status, 401);
  assert.equal(googleCalls.length, grants, 'Google was never contacted for refused callbacks');

  const done = await request(callbackPath, { headers: { cookie: binding } });
  assert.equal(done.status, 200);
  assert.match(done.headers.get('content-type'), /text\/html/);
  assert.match(await done.text(), /Orbit uygulamasına dönebilirsin/);
  assert.match(done.headers.get('set-cookie'), /__Host-orbit_gcal_bind=;.*Max-Age=0/, 'binding cookie is cleared');
  assert.equal(googleCalls.length, grants + 1);
  assert.deepEqual(googleCalls.at(-1), { url: 'https://oauth2.googleapis.com/token', code: 'auth-code-1', redirect: origin + '/api/google-calendar/callback' });
  const credential = await database.prepare('SELECT owner, refresh_token_ciphertext FROM orbit_google_calendar_credentials').first();
  assert.equal(credential.owner, 'emir');
  assert.equal(credential.refresh_token_ciphertext.includes('refresh-test-value'), false);
  const status = await (await request('/api/google-calendar/status', { headers: bearer(token) })).json();
  assert.equal(status.connected, true);
  // The state was consumed: replaying the callback grants nothing.
  assert.equal((await request(callbackPath, { headers: { cookie: binding } })).status, 401);
});

test('Google app flow: expired ticket, denied consent, and no new unauthenticated surface', async () => {
  const { token } = await issue();
  const mint = async () => new URL((await (await request('/api/google-calendar/connect-link', { method: 'POST', headers: bearer(token) })).json()).url);
  const expired = await mint();
  await database.prepare('UPDATE orbit_google_calendar_oauth_states SET expires_at = 1').run();
  assert.equal((await request(expired.pathname + expired.search)).status, 410);

  const { state, binding } = await startAppLink(token);
  const denied = await request(`/api/google-calendar/callback?error=access_denied&state=${state}`, { headers: { cookie: binding } });
  assert.equal(denied.status, 200);
  assert.match(await denied.text(), /İzin verilmedi/);
  assert.equal((await request(`/api/google-calendar/callback?error=access_denied&state=${state}`, { headers: { cookie: binding } })).status, 401, 'state is single use');

  // An expired app state (5 min) is refused even with the right browser.
  const late = await startAppLink(token);
  await database.prepare('UPDATE orbit_google_calendar_oauth_states SET expires_at = 1').run();
  assert.equal((await request(`/api/google-calendar/callback?code=c&state=${late.state}`, { headers: { cookie: late.binding } })).status, 401);

  // Without a session the link/callback doors are the ONLY open ones, and only with their secrets.
  assert.equal((await request('/api/google-calendar/connect')).status, 401);
  assert.equal((await request('/api/google-calendar/connect?link=short')).status, 401);
  assert.equal((await request('/api/google-calendar/callback')).status, 401);
  assert.equal((await request('/api/google-calendar/callback', { method: 'POST' })).status, 401);
  assert.equal((await request(`/api/state?link=${'A'.repeat(43)}`)).status, 401);
  assert.equal((await request('/api/google-calendar/status?link=' + 'A'.repeat(43))).status, 401);
  // A malformed Bearer never gains the sessionless door either.
  assert.equal((await request(`/api/google-calendar/connect?link=${'A'.repeat(43)}`, { headers: { authorization: 'Bearer nope' } })).status, 401);
});

test('the sessionless doors are rate limited per client before D1 is touched', async () => {
  const flood = '203.0.113.200';
  const hit = () => request(`/api/google-calendar/callback?code=c&state=${'Q'.repeat(43)}`, { headers: { 'cf-connecting-ip': flood } });
  for (let i = 0; i < 20; i++) assert.equal((await hit()).status, 401, `request ${i + 1}`);
  const limited = await hit();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.match(await limited.text(), /Çok fazla istek/);
  const link = await request(`/api/google-calendar/connect?link=${'Q'.repeat(43)}`, { headers: { 'cf-connecting-ip': flood } });
  assert.equal(link.status, 429, 'same budget for the link door');
  assert.equal((await request(`/api/google-calendar/callback?code=c&state=${'Q'.repeat(43)}`, { headers: { 'cf-connecting-ip': '203.0.113.201' } })).status, 401, 'other clients are unaffected');
});

test('lowercase and uppercase Bearer schemes work, and Bearer wins over a valid cookie on writes', async () => {
  const { token } = await issue();
  for (const scheme of ['bearer', 'BEARER', 'Bearer']) assert.equal((await request('/api/state', { headers: { authorization: `${scheme} ${token}` } })).status, 200, scheme);
  const cookie = cookieOf(await webLogin());
  // Cookie present, no Origin: a cookie-only write is refused (403), but the Bearer is what counts here.
  const bearerWrite = await request('/api/state', { method: 'PUT', headers: { ...bearer(token), cookie, 'content-type': 'application/json' }, body: JSON.stringify({ state: { tasks: [] }, revision: 0 }) });
  assert.notEqual(bearerWrite.status, 403);
  assert.equal(bearerWrite.headers.get('set-cookie'), null);
  assert.deepEqual(await (await request('/__who', { headers: { ...bearer(token), cookie } })).json(), { user: 'emir', bearer: true });
});

test('Google Calendar events and disconnect work with Bearer, without Origin', async () => {
  const { token } = await issue();
  await connectGoogle(token);
  const json = { 'content-type': 'application/json' };
  const before = calendarCalls.length;
  const list = await request('/api/google-calendar/events?timeMin=2026-10-01T00:00:00Z&timeMax=2026-11-01T00:00:00Z', { headers: bearer(token) });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { items: [{ id: 'ev-listed' }] });
  const created = await request('/api/google-calendar/events', { method: 'POST', headers: { ...bearer(token), ...json }, body: JSON.stringify({ summary: 'Deneme' }) });
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { id: 'ev-created' });
  const removed = await request('/api/google-calendar/events', { method: 'DELETE', headers: { ...bearer(token), ...json }, body: JSON.stringify({ eventId: 'ev-1' }) });
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { deleted: true });
  assert.deepEqual(calendarCalls.slice(before).filter(call => call.url.includes('/calendar/v3/')).map(call => [call.method, call.auth]),
    [['GET', 'Bearer access-test'], ['POST', 'Bearer access-test'], ['DELETE', 'Bearer access-test']]);
  assert.equal((await request('/api/google-calendar/events', { method: 'POST', headers: { ...json }, body: '{"summary":"x"}' })).status, 401, 'still needs a token');
  const gone = await request('/api/google-calendar/disconnect', { method: 'DELETE', headers: bearer(token) });
  assert.equal(gone.status, 200);
  assert.deepEqual(await gone.json(), { disconnected: true });
  assert.equal(await database.prepare('SELECT 1 FROM orbit_google_calendar_credentials').first(), null);
  assert.equal((await (await request('/api/google-calendar/status', { headers: bearer(token) })).json()).connected, false);
});

test('web Google linking (cookie) still works exactly as before: web state, redirect back into the app', async () => {
  const cookie = cookieOf(await webLogin());
  const start = await request('/api/google-calendar/connect', { headers: { cookie } });
  assert.equal(start.status, 302);
  assert.equal(start.headers.get('set-cookie'), null, 'the web flow needs no binding cookie');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const done = await request(`/api/google-calendar/callback?code=web-code&state=${state}`, { headers: { cookie } });
  assert.equal(done.status, 303);
  assert.match(done.headers.get('location'), /view=calendar&google-calendar=connected$/);
  assert.equal((await request(`/api/google-calendar/callback?code=web-code&state=${state}`, { headers: { cookie } })).headers.get('location').endsWith('google-calendar=failed'), true);
});

test('when D1 fails during the app link the system browser gets a short Turkish page, not JSON', async () => {
  const { token } = await issue();
  const { binding, state } = await startAppLink(token);
  const migration = readFileSync(new URL('../migrations/0004_google_calendar.sql', import.meta.url), 'utf8').split(';').map(query => query.trim()).filter(Boolean);
  await database.prepare('DROP TABLE orbit_google_calendar_oauth_states').run();
  try {
    const callback = await request(`/api/google-calendar/callback?code=c&state=${state}`, { headers: { cookie: binding } });
    assert.equal(callback.status, 503);
    assert.match(callback.headers.get('content-type'), /text\/html/);
    assert.match(await callback.text(), /Bağlantı kurulamadı/);
    const connect = await request(`/api/google-calendar/connect?link=${'R'.repeat(43)}`);
    assert.equal(connect.status, 503);
    assert.match(connect.headers.get('content-type'), /text\/html/);
    assert.match(await connect.text(), /Bağlantı kurulamadı/);
  } finally {
    await database.batch(migration.map(query => database.prepare(query)));
  }
});
