import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, scryptSync } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { loadModuleUrl } from './load-module.mjs';
import ts from 'typescript';

const { lookupSession, forgetSession, clearSessionCache, cacheSeconds, updateCachedSession } = await import(loadModuleUrl(new URL('../auth/session-cache.ts', import.meta.url)));

// ---------------------------------------------------------------- session cache (unit, deterministic clock)
const VERSION = 'v1';
function fakeEnv({ ttl, version = VERSION, failBatch = false } = {}) {
  const sessions = new Map(); const calls = { session: 0, batch: 0 };
  let gate = null; // optional promise that holds every D1 call
  const row = { state_json: '{"n":1}', revision: 7, updated_at: 'x' };
  const lookup = ([hash, v, now]) => {
    const s = sessions.get(hash);
    return s && v === version && s.expires_at > now ? { token_hash: hash, remembered: 0, expires_at: s.expires_at, refreshed_at: 0 } : undefined;
  };
  const statement = sql => ({ sql, args: [], bind(...args) { this.args = args; return this; },
    async first() { if (gate) await gate; calls.session++; return lookup(this.args) ?? null; } });
  const env = { ORBIT_SESSION_CACHE_SECONDS: ttl,
    DB: { prepare: statement,
      async batch(statements) { if (gate) await gate; calls.batch++; if (failBatch) throw new Error('no such table: orbit_state');
        return [{ results: [lookup(statements[0].args)].filter(Boolean) }, { results: [row] }]; } } };
  return { env, sessions, calls, hold() { let release; gate = new Promise(r => { release = r; }); return () => { gate = null; release(); }; } };
}
const ask = (env, tokenHash, now, extra = {}) => lookupSession(env, { tokenHash, version: VERSION, now, fresh: false, withState: false, ...extra });

test('a verified session is reused for N seconds and then re-checked against D1', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('a', { expires_at: 10_000 });
  assert.equal((await ask(f.env, 'a', 1000)).source, 'miss');
  assert.equal((await ask(f.env, 'a', 1010)).source, 'hit');
  assert.equal((await ask(f.env, 'a', 1029)).source, 'hit');
  assert.equal(f.calls.session, 1);
  // Revoked in D1 by another isolate (logout, rotation): accepted at most N seconds, never at N.
  f.sessions.delete('a');
  assert.ok((await ask(f.env, 'a', 1029)).session, 'still inside the bound');
  const rejected = await ask(f.env, 'a', 1030);
  assert.equal(rejected.session, null);
  assert.equal(f.calls.session, 2);
  assert.equal((await ask(f.env, 'a', 1031)).session, null);
});
test('the cookie alone proves nothing: unknown tokens, wrong credential version and expired rows never populate the cache', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('real', { expires_at: 5000 });
  assert.equal((await ask(f.env, 'forged', 1000)).session, null);
  assert.equal((await ask(f.env, 'forged', 1001)).session, null);
  assert.equal(f.calls.session, 2, 'misses are never cached');
  assert.ok((await ask(f.env, 'real', 1000)).session);
  assert.equal((await lookupSession(f.env, { tokenHash: 'real', version: 'other', now: 1001, fresh: false, withState: false })).session, null);
  assert.equal((await ask(f.env, 'real', 4999)).session?.token_hash, 'real');
  assert.equal((await ask(f.env, 'real', 5001)).session, null, 'server expiry beats the cache');
});
test('mutating requests always re-check D1 and revocation in this isolate is immediate', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('a', { expires_at: 9999 });
  await ask(f.env, 'a', 100);
  f.sessions.delete('a');
  assert.equal((await ask(f.env, 'a', 101, { fresh: true })).session, null);
  f.sessions.set('b', { expires_at: 9999 });
  await ask(f.env, 'b', 100); f.sessions.delete('b');
  forgetSession('b');
  assert.equal((await ask(f.env, 'b', 100)).session, null);
});
test('a lookup that races a logout cannot put the revoked session back into the cache', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('a', { expires_at: 9999 });
  const release = f.hold();
  const racing = ask(f.env, 'a', 500);
  forgetSession('a'); f.sessions.delete('a');
  release(); await racing;
  assert.equal((await ask(f.env, 'a', 501)).session, null);
});
test('a burst of cold requests (page plus bundles) shares one D1 lookup', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('a', { expires_at: 9999 });
  const release = f.hold();
  const burst = Array.from({ length: 47 }, () => ask(f.env, 'a', 100));
  release();
  const results = await Promise.all(burst);
  assert.ok(results.every(r => r.session));
  assert.equal(f.calls.session, 1);
});
test('GET /api/state reads session and workspace row in one D1 round trip; a broken workspace table cannot break authentication', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('a', { expires_at: 9999 });
  const first = await ask(f.env, 'a', 100, { withState: true });
  assert.equal(first.stateRow.revision, 7);
  assert.deepEqual([f.calls.batch, f.calls.session], [1, 0]);
  assert.equal((await ask(f.env, 'a', 101, { withState: true })).stateRow, undefined, 'cache hit: the route reads its own row');
  clearSessionCache();
  const broken = fakeEnv({ failBatch: true }); broken.sessions.set('a', { expires_at: 9999 });
  const fallback = await ask(broken.env, 'a', 100, { withState: true });
  assert.ok(fallback.session); assert.equal(fallback.stateRow, undefined);
});
test('a /api/state read starts its own batch instead of waiting behind a plain lookup, and a plain lookup may share the batch', async () => {
  clearSessionCache();
  const f = fakeEnv(); f.sessions.set('a', { expires_at: 9999 });
  const release = f.hold();
  const plain = ask(f.env, 'a', 100); const state = ask(f.env, 'a', 100, { withState: true }); const other = ask(f.env, 'a', 100);
  release();
  const [, withRow, shared] = await Promise.all([plain, state, other]);
  assert.equal(withRow.stateRow.revision, 7);
  assert.deepEqual([f.calls.session, f.calls.batch], [1, 1]);
  assert.ok(shared.session);
});
test('the bound is configurable, capped, and 0 disables caching', async () => {
  assert.equal(cacheSeconds({}), 30);
  assert.equal(cacheSeconds({ ORBIT_SESSION_CACHE_SECONDS: '5' }), 5);
  assert.equal(cacheSeconds({ ORBIT_SESSION_CACHE_SECONDS: '9999' }), 60);
  assert.equal(cacheSeconds({ ORBIT_SESSION_CACHE_SECONDS: 'abc' }), 30);
  assert.equal(cacheSeconds({ ORBIT_SESSION_CACHE_SECONDS: '-3' }), 0);
  clearSessionCache();
  const f = fakeEnv({ ttl: '0' }); f.sessions.set('a', { expires_at: 9999 });
  await ask(f.env, 'a', 1); await ask(f.env, 'a', 1);
  assert.equal(f.calls.session, 2);
});
test('the cache is small, and a refreshed expiry is reflected without a second lookup', async () => {
  clearSessionCache();
  const f = fakeEnv();
  for (let i = 0; i < 20; i++) { f.sessions.set(`t${i}`, { expires_at: 9999 }); await ask(f.env, `t${i}`, 100); }
  const before = f.calls.session;
  await ask(f.env, 't19', 101); assert.equal(f.calls.session, before);
  await ask(f.env, 't0', 101); assert.equal(f.calls.session, before + 1, 'oldest entries were evicted');
  updateCachedSession('t19', { expires_at: 12345, refreshed_at: 101 });
  const hit = await ask(f.env, 't19', 102); assert.equal(hit.session.expires_at, 12345);
});

// ---------------------------------------------------------------- gate end to end (Miniflare)
const password = 'test-password-only-DO-NOT-DEPLOY';
const salt = Buffer.alloc(16, 9);
const passwordHash = `scrypt:16384:8:5:${salt.toString('hex')}:${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5 }).toString('hex')}`;
const origin = 'https://os.cosmibit.com';
const day = 86400;
const sql = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').split(';').map(q => q.trim()).filter(Boolean);
let mf, db;
before(async () => {
  const bundle = await build({
    stdin: { contents: `import {withAuthentication} from './auth/gate'; import {authenticatedUser, prefetchedStateRow} from './auth/context';
      export default {fetch(request,env){env.ASSETS={fetch:async()=>new Response('public')};return withAuthentication(request,env,async()=>{
        const p=new URL(request.url).pathname;
        if(p==='/')return new Response('<html>shell</html>',{headers:{'content-type':'text/html'}});
        if(p==='/other')return new Response('<html>other</html>',{headers:{'content-type':'text/html'}});
        if(p.startsWith('/_next/static/'))return new Response('js',{headers:{'content-type':'text/javascript'}});
        return Response.json({user:authenticatedUser(),prefetched:prefetchedStateRow()??null,wasPrefetched:prefetchedStateRow()!==undefined});})}};`, resolveDir: process.cwd(), loader: 'ts' },
    platform: 'node', format: 'esm', bundle: true, write: false,
  });
  mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    bindings: { ORBIT_AUTH_USERNAME: 'emir', ORBIT_AUTH_PASSWORD_HASH: passwordHash, ORBIT_SESSION_CACHE_SECONDS: '3' } });
  db = await mf.getD1Database('DB');
  await db.batch([...sql('0001_orbit_state.sql'), ...sql('0002_auth.sql')].map(q => db.prepare(q)));
  await db.prepare("INSERT INTO orbit_state (workspace_id, state_json, revision) VALUES ('orbit-personal-os', '{\"hello\":1}', 4)").run();
});
after(async () => { await mf?.dispose(); });
const request = (path, options = {}) => mf.dispatchFetch(origin + path, { redirect: 'manual', ...options });
let ip = 100;
const login = async (fields = {}) => request('/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': `192.0.2.${ip++}` },
  body: new URLSearchParams({ username: 'emir', password, ...fields }).toString() });
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const hashOf = value => createHash('sha256').update(value.split('=')[1]).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('a revoked session is rejected within N seconds (N=3 here, 30 by default) and writes see the revocation at once', async () => {
  const value = cookie(await login());
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 200);
  await db.prepare('DELETE FROM orbit_auth_sessions WHERE token_hash = ?').bind(hashOf(value)).run(); // revoked from "another isolate"
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 200, 'reads may use the verified lookup for up to N seconds');
  assert.equal((await request('/api/x', { method: 'PUT', headers: { cookie: value, origin }, body: '{}' })).status, 401, 'writes never use the cache');
  await sleep(3100);
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 401, 'after N seconds the read is rejected too');
});
test('logout through this isolate invalidates the cached session immediately', async () => {
  const value = cookie(await login({ remember: '1' }));
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 200);
  assert.equal((await request('/auth/logout', { method: 'POST', headers: { cookie: value, origin } })).status, 303);
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 401);
  assert.equal((await request('/', { headers: { cookie: value, accept: 'text/html' } })).status, 303);
});
test('a session that expires in D1 is rejected even while it sits in the cache', async () => {
  const value = cookie(await login());
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 200);
  const past = Math.floor(Date.now() / 1000) - 5;
  await db.prepare('UPDATE orbit_auth_sessions SET expires_at = ? WHERE token_hash = ?').bind(past, hashOf(value)).run();
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 200, 'cached entry carries the old expiry until re-check');
  await sleep(3100);
  assert.equal((await request('/api/x', { headers: { cookie: value } })).status, 401);
});
test('static files never renew the session or set a cookie, so they stay cacheable; documents still do', async () => {
  const value = cookie(await login({ remember: '1' }));
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('UPDATE orbit_auth_sessions SET refreshed_at = ?, expires_at = ? WHERE token_hash = ?').bind(now - 2 * day, now + 80 * day, hashOf(value)).run();
  const asset = await request('/_next/static/chunks/a-1.js', { headers: { cookie: value } });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('set-cookie'), null);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  const untouched = await db.prepare('SELECT refreshed_at FROM orbit_auth_sessions WHERE token_hash = ?').bind(hashOf(value)).first();
  assert.equal(untouched.refreshed_at, now - 2 * day);
  const page = await request('/', { headers: { cookie: value, accept: 'text/html', 'sec-fetch-dest': 'document' } });
  assert.match(page.headers.get('set-cookie'), /Max-Age=77/);
  assert.match(page.headers.get('cache-control'), /no-store/);
  // The renewed expiry is visible to later (cached) reads without another lookup.
  const again = await request('/_next/static/chunks/a-1.js', { headers: { cookie: value } });
  assert.equal(again.headers.get('set-cookie'), null);
});
test('only the authenticated HTML shell of "/" is marked for the service worker', async () => {
  const value = cookie(await login());
  const shell = await request('/', { headers: { cookie: value, accept: 'text/html' } });
  assert.equal(shell.headers.get('x-orbit-shell'), '1');
  for (const path of ['/other', '/api/x', '/_next/static/a.js']) assert.equal((await request(path, { headers: { cookie: value, accept: 'text/html' } })).headers.get('x-orbit-shell'), null, path);
  assert.equal((await request('/')).headers.get('x-orbit-shell'), null, 'login redirect is never the shell');
  assert.equal((await request('/login')).headers.get('x-orbit-shell'), null);
});
test('Server-Timing exposes durations and a hit/miss label only', async () => {
  const value = cookie(await login());
  const first = await request('/api/x', { headers: { cookie: value } });
  const second = await request('/api/x', { headers: { cookie: value } });
  for (const response of [first, second, await request('/api/x'), await request('/login'), await request('/favicon.svg')]) {
    assert.match(response.headers.get('server-timing'), /^session;dur=\d+;desc="(?:hit|miss|fresh|none)", app;dur=\d+, total;dur=\d+$/);
  }
  assert.match(second.headers.get('server-timing'), /desc="hit"/);
});
test('/api/state: session and workspace row arrive in one lookup, a cached request falls back to the route read', async () => {
  const value = cookie(await login());
  const first = await (await request('/api/state', { headers: { cookie: value } })).json();
  assert.equal(first.wasPrefetched, true);
  assert.equal(first.prefetched.revision, 4);
  const second = await (await request('/api/state', { headers: { cookie: value } })).json();
  assert.equal(second.wasPrefetched, false);
  const other = await (await request('/api/x', { headers: { cookie: value } })).json();
  assert.equal(other.wasPrefetched, false, 'only GET /api/state prefetches');
});

// ---------------------------------------------------------------- service worker (app shell rules)
const swSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://os.cosmibit.com';
const opaqueRedirect = () => { const r = new Response(null, { status: 200 }); Object.defineProperty(r, 'status', { value: 0 }); return typed(r, { type: 'opaqueredirect' }); };
function typed(response, { type = 'basic', redirected = false } = {}) {
  // Real clones keep type/redirected; Node's Response does not, so carry them over.
  const status = response.status; const clone = Response.prototype.clone;
  Object.defineProperty(response, 'type', { value: type }); Object.defineProperty(response, 'redirected', { value: redirected });
  Object.defineProperty(response, 'status', { value: status });
  Object.defineProperty(response, 'clone', { value: () => typed(clone.call(response), { type, redirected }) });
  return response;
}
const shellResponse = (body = '<html><script src="/_next/static/chunks/a-1.js"></script><link href="/_next/static/css/b-2.css"></html>') =>
  typed(new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', 'X-Orbit-Shell': '1', 'Cache-Control': 'private, no-store' } }));
function swHarness({ reply, extraCaches = [] } = {}) {
  const handlers = {}; const stores = new Map(extraCaches.map(name => [name, new Map()]));
  const fetched = []; let pending = [];
  const cacheFor = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name); const key = r => typeof r === 'string' ? r : r.url;
    return { match: async r => map.get(key(r))?.clone(), put: async (r, v) => { map.set(key(r), v.clone()); }, delete: async r => map.delete(key(r)), keys: async () => [...map.keys()].map(url => ({ url })) };
  };
  const caches = { open: async name => cacheFor(name), keys: async () => [...stores.keys()], delete: async name => stores.delete(name) };
  const self = { location: { origin: ORIGIN }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  const fetchFn = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    fetched.push({ url, credentials: init?.credentials ?? input.credentials });
    return reply(url, fetched.length);
  };
  runInNewContext(swSource, { self, caches, URL, Response, Promise, fetch: fetchFn });
  const settle = async () => { while (pending.length) { const batch = pending; pending = []; await Promise.all(batch); } };
  const navigation = (path, { mode = 'navigate', method = 'GET', origin = ORIGIN } = {}) => ({ url: origin + path, method, mode });
  return {
    fetched, stores, handlers, settle,
    async handle(request) {
      let response; handlers.fetch({ request, respondWith: v => { response = v; }, waitUntil: v => { pending.push(v); } });
      return response ? await response : undefined;
    },
    navigation,
    async message(data) { handlers.message({ data, waitUntil: v => { pending.push(v); } }); await settle(); },
    async activate() { let p; handlers.activate({ waitUntil: v => { p = v; } }); await p; },
  };
}
const body = async response => response && await response.text();
function standard(shells = [shellResponse()]) {
  let index = 0;
  const state = { shells, assets: new Map(), calls: 0 };
  return { state, reply: url => {
    state.calls++;
    const path = url.replace(ORIGIN, '');
    if (path === '/') { const next = state.shells[Math.min(index++, state.shells.length - 1)]; return typeof next === 'function' ? next() : next.clone(); }
    return typed(new Response(`asset:${path}`, { status: 200, headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'private, max-age=31536000, immutable' } }));
  } };
}

test('app shell: first launch comes from the network and is kept with the bundles it references', async () => {
  const { reply } = standard(); const sw = swHarness({ reply });
  const first = await sw.handle(sw.navigation('/'));
  assert.match(await body(first), /<html>/);
  await sw.settle();
  assert.ok(sw.stores.get('orbit-appshell-v1').has(ORIGIN + '/'));
  const assets = sw.stores.get('orbit-static-v1');
  assert.deepEqual([...assets.keys()].sort(), [ORIGIN + '/_next/static/chunks/a-1.js', ORIGIN + '/_next/static/css/b-2.css']);
});
test('app shell: later launches open from the device copy at once and refresh it behind the scenes (stale-while-revalidate)', async () => {
  const { reply } = standard([shellResponse('<html>v1</html>'), shellResponse('<html>v2</html>')]); const sw = swHarness({ reply });
  await sw.handle(sw.navigation('/')); await sw.settle();
  const second = await sw.handle(sw.navigation('/?view=rebuild'));
  assert.equal(await body(second), '<html>v1</html>', 'served from the device copy, even with a query string');
  await sw.settle();
  assert.equal(await body(await sw.handle(sw.navigation('/'))), '<html>v2</html>', 'the next launch has the update');
});
test('app shell: only an authenticated, marked 200 HTML is ever stored', async () => {
  const bad = [
    () => typed(new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })),
    () => typed(new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html', 'X-Orbit-Shell': '1' } }), { redirected: true }),
    () => opaqueRedirect(),
    () => typed(new Response('err', { status: 503, headers: { 'Content-Type': 'text/html', 'X-Orbit-Shell': '1' } })),
    () => typed(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'X-Orbit-Shell': '1' } })),
    () => typed(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html', 'X-Orbit-Shell': '1' } }), { type: 'opaque' }),
  ];
  for (const make of bad) {
    const sw = swHarness({ reply: () => make() });
    await sw.handle(sw.navigation('/')); await sw.settle();
    assert.equal(sw.stores.get('orbit-appshell-v1')?.size ?? 0, 0);
  }
});
test('app shell: a lost session drops the shell, so the next launch goes to the network and the login page (no redirect loop)', async () => {
  for (const lost of [() => opaqueRedirect(), () => typed(new Response('', { status: 401 })), () => typed(new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), { redirected: true })]) {
    const { reply, state } = standard(); const sw = swHarness({ reply });
    await sw.handle(sw.navigation('/')); await sw.settle();
    state.shells = [lost];
    assert.match(await body(await sw.handle(sw.navigation('/'))), /<html>/, 'last good shell still opens this once; the app itself shows login on 401');
    await sw.settle();
    assert.equal(sw.stores.get('orbit-appshell-v1').size, 0);
    const callsBefore = state.calls;
    const next = await sw.handle(sw.navigation('/'));
    assert.ok(state.calls > callsBefore, 'goes to the network');
    assert.equal(next.type, lost().type);
  }
});
test('app shell: offline or a server error keeps the last good shell', async () => {
  const { reply, state } = standard(); const sw = swHarness({ reply });
  await sw.handle(sw.navigation('/')); await sw.settle();
  for (const failing of [() => { throw new Error('offline'); }, () => typed(new Response('boom', { status: 503 }))]) {
    state.shells = [failing];
    assert.match(await body(await sw.handle(sw.navigation('/'))), /<html>/); await sw.settle();
    assert.ok(sw.stores.get('orbit-appshell-v1').has(ORIGIN + '/'));
  }
});
test('app shell: APIs, auth, login, media, other pages and non-navigations are never intercepted', async () => {
  const { reply } = standard(); const sw = swHarness({ reply });
  for (const path of ['/api/state', '/api/state?rev=3', '/api/project-media?id=x', '/auth/session', '/auth/login', '/login', '/login?next=%2F', '/other', '/sw.js']) {
    assert.equal(await sw.handle(sw.navigation(path)), undefined, path);
  }
  assert.equal(await sw.handle(sw.navigation('/', { mode: 'cors' })), undefined, 'fetch() from the page is not a navigation');
  assert.equal(await sw.handle(sw.navigation('/?_rsc=abc')), undefined);
  assert.equal(await sw.handle(sw.navigation('/', { method: 'POST' })), undefined);
  assert.equal(await sw.handle(sw.navigation('/', { origin: 'https://evil.test' })), undefined);
  assert.equal(sw.fetched.length, 0);
});
test('logout wipes the shell and the bundles on this device, then performs the real logout', async () => {
  const { reply } = standard(); const sw = swHarness({ reply, extraCaches: ['another-app'] });
  await sw.handle(sw.navigation('/')); await sw.settle();
  assert.ok(sw.stores.has('orbit-appshell-v1') && sw.stores.has('orbit-static-v1'));
  const response = await sw.handle({ url: ORIGIN + '/auth/logout', method: 'POST', mode: 'navigate' });
  assert.ok(response);
  assert.deepEqual([...sw.stores.keys()], ['another-app']);
  assert.equal(sw.fetched.at(-1).url, ORIGIN + '/auth/logout');
});
test('the page can ask for the first fill; an existing shell is not refetched', async () => {
  const { reply } = standard(); const sw = swHarness({ reply });
  await sw.message({ type: 'orbit-prime-shell' });
  assert.equal(sw.fetched[0].credentials, 'same-origin');
  assert.ok(sw.stores.get('orbit-appshell-v1').has(ORIGIN + '/'));
  const count = sw.fetched.length;
  await sw.message({ type: 'orbit-prime-shell' }); await sw.message({ type: 'something-else' });
  assert.equal(sw.fetched.length, count);
});
test('activation keeps the two current caches and removes older orbit caches', async () => {
  const sw = swHarness({ reply: () => new Response('x'), extraCaches: ['orbit-shell-v4', 'orbit-static-v0', 'orbit-static-v1', 'orbit-appshell-v1', 'another-app'] });
  await sw.activate();
  assert.deepEqual([...sw.stores.keys()].sort(), ['another-app', 'orbit-appshell-v1', 'orbit-static-v1']);
});

// ---------------------------------------------------------------- session end-time mark (gate)
const markOf = response => (response.headers.getSetCookie?.() ?? []).find(c => /^(?:__Host-)?orbit_exp=/.test(c));
test('login publishes a readable end-time mark next to the session cookie; the session cookie stays first', async () => {
  const remembered = await login({ remember: '1' });
  const cookies = remembered.headers.getSetCookie();
  assert.match(cookies[0], /^__Host-orbit_session=.*HttpOnly/);
  const mark = markOf(remembered);
  assert.ok(mark && !/HttpOnly/.test(mark), 'readable by the page');
  const row = await db.prepare('SELECT expires_at FROM orbit_auth_sessions WHERE token_hash = ?').bind(hashOf(cookie(remembered))).first();
  assert.equal(mark.split(';')[0], `__Host-orbit_exp=${row.expires_at}`);
  assert.match(mark, /Max-Age=\d+/);
  const temporary = markOf(await login());
  assert.doesNotMatch(temporary, /Max-Age|Expires=/, 'browser-session mark for a temporary login');
  assert.doesNotMatch(markOf(remembered), /orbit_session|[A-Za-z0-9_-]{40}/, 'time only, no token');
});
test('the mark follows renewals (/auth/session, documents) and is cleared on logout; static files never carry it', async () => {
  const value = cookie(await login({ remember: '1' }));
  const session = await request('/auth/session', { headers: { cookie: value } });
  const row = await db.prepare('SELECT expires_at FROM orbit_auth_sessions WHERE token_hash = ?').bind(hashOf(value)).first();
  assert.equal(markOf(session).split(';')[0], `__Host-orbit_exp=${row.expires_at}`);
  assert.equal(markOf(await request('/_next/static/chunks/a-1.js', { headers: { cookie: value } })), undefined);
  const out = await request('/auth/logout', { method: 'POST', headers: { cookie: value, origin } });
  assert.match(markOf(out), /^__Host-orbit_exp=;.*Max-Age=0/);
});
test('GET endpoints that write (OAuth connect/callback, profitness connect) always re-check D1', async () => {
  const value = cookie(await login());
  for (const path of ['/api/google-calendar/connect', '/api/google-calendar/callback', '/api/integrations/profitness/connect', '/api/google-calendar/status']) {
    assert.equal((await request(path, { headers: { cookie: value } })).status, 200, path);
  }
  await db.prepare('DELETE FROM orbit_auth_sessions WHERE token_hash = ?').bind(hashOf(value)).run();
  for (const path of ['/api/google-calendar/connect', '/api/google-calendar/callback', '/api/integrations/profitness/connect']) {
    assert.equal((await request(path, { headers: { cookie: value } })).status, 401, path);
  }
  assert.equal((await request('/api/google-calendar/status', { headers: { cookie: value } })).status, 401, 'a fresh check that finds the session gone also evicts the cached entry');
});

// ---------------------------------------------------------------- page-side lock (auth-client script)
const { authClientScript } = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(readFileSync(new URL('../app/auth-client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`);
function page({ cookies = '', protocol = 'http:', session = () => ({ ok: true, status: 200 }) } = {}) {
  const calls = []; const redirects = []; const style = { visibility: '' };
  const listeners = {};
  const window = { addEventListener: (n, h) => { listeners[n] = h; }, fetch: async (url) => { calls.push(String(url)); return session(url); } };
  const context = { window, document: { cookie: cookies, documentElement: { style }, visibilityState: 'visible', addEventListener() {} },
    location: { protocol, href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', replace: url => redirects.push(url) }, URL, setInterval() {}, Number };
  runInNewContext(authClientScript, context);
  return { calls, redirects, style, window, tick: () => new Promise(r => setTimeout(r, 5)) };
}
const future = Math.floor(Date.now() / 1000) + 3600;
test('page: a valid end-time mark paints at once and asks the server nothing', async () => {
  const p = page({ cookies: `a=b; orbit_exp=${future}` }); await p.tick();
  assert.deepEqual([p.calls, p.redirects, p.style.visibility], [[], [], '']);
});
test('page: lapsed or missing mark hides the page and goes to login when offline (local copy never shown)', async () => {
  for (const cookies of ['', `orbit_exp=${future - 7200}`, 'orbit_exp=abc', `orbit_exp=`]) {
    const p = page({ cookies, session: () => { throw new Error('offline'); } }); await p.tick();
    assert.equal(p.style.visibility, 'hidden', cookies); assert.deepEqual(p.redirects, ['/login'], cookies);
  }
});
test('page: missing mark online is confirmed by the server (existing sessions are not logged out), 401 locks', async () => {
  const ok = page({ cookies: '' }); await ok.tick();
  assert.deepEqual([ok.calls, ok.redirects, ok.style.visibility], [['/auth/session'], [], '']);
  const lost = page({ cookies: '', session: () => ({ ok: false, status: 401 }) }); await lost.tick();
  assert.deepEqual([lost.redirects, lost.style.visibility], [['/login'], 'hidden']);
});
test('page: the https cookie name is used on secure origins, and the online 401 lock is unchanged', async () => {
  const secure = page({ cookies: `__Host-orbit_exp=${future}`, protocol: 'https:' }); await secure.tick();
  assert.deepEqual([secure.calls, secure.redirects], [[], []]);
  const wrongName = page({ cookies: `orbit_exp=${future}`, protocol: 'https:', session: () => { throw new Error('offline'); } }); await wrongName.tick();
  assert.deepEqual(wrongName.redirects, ['/login']);
});
