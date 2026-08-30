import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, scryptSync } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const password = 'test-password-only-DO-NOT-DEPLOY';
const salt = Buffer.alloc(16, 7);
const passwordHash = `scrypt:16384:8:5:${salt.toString('hex')}:${scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5 }).toString('hex')}`;
const origin = 'https://os.cosmibit.com';
const day = 86400;
let mf, database;
before(async () => {
  const bundle = await build({
    stdin: { contents: `import {withAuthentication} from './auth/gate'; import {authenticatedUser} from './auth/context';
      export default {fetch(request,env){env.ASSETS={fetch:async()=>new Response('public-icon')};return withAuthentication(request,env,async()=>Response.json({private:true,user:authenticatedUser()}))}};`, resolveDir: process.cwd(), loader: 'ts' },
    platform: 'node', format: 'esm', bundle: true, write: false,
  });
  mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ORBIT_AUTH_USERNAME: 'emir', ORBIT_AUTH_PASSWORD_HASH: passwordHash } });
  database = await mf.getD1Database('DB');
  await database.batch(readFileSync(new URL('../migrations/0002_auth.sql', import.meta.url), 'utf8').split(';').map(query => query.trim()).filter(Boolean).map(query => database.prepare(query)));
});
after(async () => { await mf?.dispose(); });
const request = (path, options = {}) => mf.dispatchFetch(origin + path, { redirect: 'manual', ...options });
let ip = 1;
const login = (fields = {}, headers = {}) => request('/auth/login', {
  method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': `192.0.2.${ip++}`, ...headers },
  body: new URLSearchParams({ username: 'emir', password, ...fields }).toString(),
});
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const sessionHash = value => createHash('sha256').update(value.split('=')[1]).digest('hex');

test('anonymous pages redirect, while private APIs, assets and RSC deny access', async () => {
  assert.equal((await request('/')).headers.get('location'), '/login');
  for (const path of ['/api/state', '/api/organize', '/api/google-config', '/api/project-media', '/_next/static/private.js', '/? _rsc=x'.replace(' ', ''), '/auth/session']) {
    const response = await request(path, { headers: { 'oai-authenticated-user-id': 'emir' } });
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal((await response.text()).includes('private":true'), false);
  }
  assert.equal((await request('/', { headers: { rsc: '1', accept: 'text/html' } })).status, 401);
  assert.equal((await request('/api/state', { method: 'PUT', headers: { origin }, body: '{}' })).status, 401);
  assert.equal((await request('/favicon.svg')).status, 200);
});

test('login is public, CSP protected, and never contains private app bundles', async () => {
  const response = await request('/login');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await response.text();
  assert.match(html, /Beni hatırla/);
  assert.doesNotMatch(html, /_next\/static|orbit_state|test-password-only/);
});

test('wrong username and wrong password are indistinguishable, with no session', async () => {
  for (const fields of [{ password: 'wrong' }, { username: 'other' }]) {
    const response = await login(fields);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.match(await response.text(), /Kullanıcı adı veya parola hatalı/);
  }
});

test('remembered login survives new requests, uses a secure 90-day HttpOnly cookie and stores only a token hash', async () => {
  const response = await login({ remember: '1' });
  assert.equal(response.status, 303);
  const header = response.headers.get('set-cookie');
  for (const setting of ['__Host-orbit_session=', 'Max-Age=7776000', 'HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/']) assert.ok(header.includes(setting));
  const value = cookie(response);
  const row = await database.prepare('SELECT * FROM orbit_auth_sessions WHERE token_hash = ?').bind(sessionHash(value)).first();
  assert.equal(row.remembered, 1);
  assert.equal(row.expires_at - row.created_at, 90 * day);
  assert.equal(JSON.stringify(row).includes(value.split('=')[1]), false);
  assert.deepEqual(await (await request('/api/state', { headers: { cookie: value } })).json(), { private: true, user: 'emir' });
  assert.deepEqual(await (await request('/auth/session', { headers: { cookie: value } })).json(), { authenticated: true, remembered: true });
});

test('normal login uses a browser-session cookie and a 24-hour server expiry', async () => {
  const response = await login();
  assert.doesNotMatch(response.headers.get('set-cookie'), /Max-Age|Expires=/);
  const row = await database.prepare('SELECT * FROM orbit_auth_sessions WHERE token_hash = ?').bind(sessionHash(cookie(response))).first();
  assert.equal(row.remembered, 0);
  assert.equal(row.expires_at - row.created_at, day);
});

test('remembered sessions roll forward after use without requiring credentials again', async () => {
  const value = cookie(await login({ remember: '1' }));
  const now = Math.floor(Date.now() / 1000);
  await database.prepare('UPDATE orbit_auth_sessions SET refreshed_at = ?, expires_at = ? WHERE token_hash = ?').bind(now - 2 * day, now + 80 * day, sessionHash(value)).run();
  const response = await request('/auth/session', { headers: { cookie: value } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /Max-Age=7776000/);
  const row = await database.prepare('SELECT * FROM orbit_auth_sessions WHERE token_hash = ?').bind(sessionHash(value)).first();
  assert.ok(row.expires_at >= now + 90 * day);
  assert.equal((await request('/auth/session', { headers: { cookie: value } })).headers.get('set-cookie'), null);
});

test('logout revokes the server token and a captured cookie cannot be reused', async () => {
  const value = cookie(await login({ remember: '1' }));
  const response = await request('/auth/logout', { method: 'POST', headers: { cookie: value, origin } });
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  assert.match(response.headers.get('clear-site-data'), /storage/);
  assert.equal((await request('/api/state', { headers: { cookie: value } })).status, 401);
});

test('expired sessions and password-rotated sessions are rejected', async () => {
  for (const assignment of ['expires_at = 1', "credential_version = 'old-password'"]) {
    const value = cookie(await login());
    await database.prepare(`UPDATE orbit_auth_sessions SET ${assignment} WHERE token_hash = ?`).bind(sessionHash(value)).run();
    assert.equal((await request('/api/state', { headers: { cookie: value } })).status, 401);
  }
});

test('CSRF, duplicate cookies, insecure cookies and malformed bodies fail closed', async () => {
  assert.equal((await login({}, { origin: 'https://evil.example' })).status, 403);
  const value = cookie(await login());
  for (const path of ['/auth/logout', '/api/state']) {
    assert.equal((await request(path, { method: 'POST', headers: { cookie: value, origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request(path, { method: 'POST', headers: { cookie: value } })).status, 403);
  }
  for (const invalid of [`${value}; ${value}`, value.replace('__Host-', ''), '__Host-orbit_session=garbage']) assert.equal((await request('/api/state', { headers: { cookie: invalid } })).status, 401);
  assert.equal((await login({ password: 'x'.repeat(5000) })).status, 400);
  assert.equal((await request('/auth/logout')).status, 405);
});

test('login redirects cannot leave the site or loop through authentication', async () => {
  for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/logout', '/login?next=evil']) {
    assert.equal((await login({ next })).headers.get('location'), '/');
  }
  assert.equal((await login({ next: '/?view=rebuild' })).headers.get('location'), '/?view=rebuild');
});

test('persistent attempt limits reject repeated guessing before password verification', async () => {
  for (let i = 0; i < 11; i++) {
    const response = await login({ password: 'wrong' }, { 'cf-connecting-ip': '198.51.100.50' });
    assert.equal(response.status, i < 10 ? 401 : 429);
    if (i === 10) assert.ok(Number(response.headers.get('retry-after')) > 0);
  }
});
