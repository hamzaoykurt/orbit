import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, scryptSync } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Default production setting: ORBIT_WEB_LOGIN unset, so the browser interface is closed and only the
// native app (Bearer token) gets in. Real gate and real /api/state route inside workerd.
const password = 'test-password-only-DO-NOT-DEPLOY';
const salt = Buffer.alloc(16, 5);
const passwordHash = `scrypt:16384:8:5:${salt.toString('hex')}:${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5 }).toString('hex')}`;
const origin = 'https://os.cosmibit.com';
const sha = value => createHash('sha256').update(value).digest('hex');
let mf, database;
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `import {withAuthentication} from './auth/gate'; import * as state from './app/api/state/route';
        const routes = {'/api/state':state,'/api/google-calendar/connect':{GET:()=>new Response('oauth-leg')},'/':{GET:()=>new Response('<html>private shell</html>',{headers:{'content-type':'text/html'}})}};
        export default {fetch(request,env){env.ASSETS={fetch:async()=>new Response('public-icon')};
          return withAuthentication(request,env,async()=>{const handler=routes[new URL(request.url).pathname]?.[request.method];return handler?handler(request):new Response('not found',{status:404})})}};`,
      resolveDir: process.cwd(), loader: 'ts',
    },
    platform: 'node', format: 'esm', bundle: true, write: false, external: ['cloudflare:workers'],
  });
  mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    bindings: { ORBIT_AUTH_USERNAME: 'emir', ORBIT_AUTH_PASSWORD_HASH: passwordHash } });
  database = await mf.getD1Database('DB');
  for (const file of ['0001_orbit_state.sql', '0002_auth.sql']) {
    await database.batch(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8').split(';').map(query => query.trim()).filter(Boolean).map(query => database.prepare(query)));
  }
});
after(async () => { await mf?.dispose(); });
let ip = 1;
const request = (path, options = {}) => mf.dispatchFetch(origin + path, { redirect: 'manual', ...options, headers: { 'cf-connecting-ip': `198.51.100.${ip++}`, ...options.headers } });

test('the web form refuses correct credentials and sets no cookie', async () => {
  const response = await request('/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'emir', password, remember: '1' }).toString() });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(await response.text(), /Web arayüzü kapalı/);
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM orbit_auth_sessions').first()).n, 0);
});

test('the login page has no form and points to the app', async () => {
  const response = await request('/login');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Web arayüzü kapalı/);
  assert.doesNotMatch(html, /<form|type="password"|\/auth\/session/);
  assert.equal((await request('/')).headers.get('location'), '/login');
});

test('a web session from before the switch opens nothing and is dropped from the browser', async () => {
  const token = 'C'.repeat(43);
  const now = Math.floor(Date.now() / 1000);
  await database.prepare('INSERT INTO orbit_auth_sessions (token_hash, credential_version, remembered, created_at, refreshed_at, expires_at) VALUES (?, ?, 1, ?, ?, ?)')
    .bind(sha(token), sha(`emir:${passwordHash}`), now, now, now + 86400).run();
  const cookie = `__Host-orbit_session=${token}`;
  const page = await request('/', { headers: { cookie, accept: 'text/html' } });
  assert.equal(page.status, 303);
  assert.equal(page.headers.get('location'), '/login');
  assert.match(page.headers.get('set-cookie'), /__Host-orbit_session=; .*Max-Age=0/);
  assert.match(page.headers.get('clear-site-data'), /storage/);
  for (const path of ['/api/state', '/auth/session']) assert.equal((await request(path, { headers: { cookie } })).status, 401, path);
  assert.equal((await request('/api/state', { method: 'PUT', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{"state":{},"revision":0}' })).status, 401);
});

test('the native app still signs in with a token and reads and writes its state', async () => {
  const grant = await request('/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'emir', password, device: 'test' }) });
  assert.equal(grant.status, 200);
  const { token } = await grant.json();
  const auth = { authorization: `Bearer ${token}` };
  assert.deepEqual(await (await request('/auth/session', { headers: auth })).json().then(({ authenticated }) => ({ authenticated })), { authenticated: true });
  const first = await request('/api/state', { headers: auth });
  assert.equal(first.status, 200);
  const { revision } = await first.json();
  const put = await request('/api/state', { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ state: { profile: { name: 'x' } }, revision }) });
  assert.equal(put.status, 200);
  assert.equal((await request('/auth/token/revoke', { method: 'POST', headers: auth })).status, 200);
});

test('the sessionless Google Calendar leg the app opens in the browser still passes the gate', async () => {
  const response = await request(`/api/google-calendar/connect?link=${'L'.repeat(43)}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'oauth-leg');
});
