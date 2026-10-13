import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const startupSource = ts.transpileModule(readFileSync(new URL('../app/startup.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { startupScript, readStartupState } = await import(`data:text/javascript;base64,${Buffer.from(startupSource).toString('base64')}`);

test('data starts before hydration and is reused without a second request', async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  let requests = 0;
  let resolve;
  const network = new Promise(done => { resolve = done; });
  const window = {};
  const fetch = async (url, options) => { requests++; assert.equal(url, '/api/state'); assert.equal(options.cache, 'no-store'); return network; };
  try {
    globalThis.window = window;
    globalThis.fetch = fetch;
    runInNewContext(startupScript, { window, fetch, AbortSignal });
    assert.equal(requests, 1);
    runInNewContext(startupScript, { window, fetch, AbortSignal });
    assert.equal(requests, 1);
    const first = readStartupState();
    const strictModeSecond = readStartupState();
    resolve({ ok: true, json: async () => ({ state: { notes: ['saved'] } }) });
    assert.deepEqual(await first, { state: { notes: ['saved'] } });
    assert.deepEqual(await strictModeSecond, { state: { notes: ['saved'] } });
    assert.equal(requests, 1);
    assert.equal(window.__orbitStartupState, undefined);
  } finally { globalThis.window = previousWindow; globalThis.fetch = previousFetch; }
});

test('early data request fails safely without an unhandled rejection', async () => {
  const window = {};
  runInNewContext(startupScript, { window, AbortSignal, fetch: async () => { throw new Error('offline'); } });
  assert.equal(await window.__orbitStartupState, null);
});

const workerSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function workerHarness({ reply = () => new Response('body', { status: 200 }), brokenStorage = false } = {}) {
  const handlers = {};
  const entries = new Map();
  const deleted = [];
  let requests = 0;
  const key = request => typeof request === 'string' ? request : request.url;
  const cache = { match: async request => entries.get(key(request))?.clone(), put: async (request, response) => { entries.set(key(request), response.clone()); }, keys: async () => [...entries.keys()].map(url => ({ url })), delete: async request => { entries.delete(key(request)); } };
  const caches = { open: async () => { if (brokenStorage) throw new Error('blocked'); return cache; }, keys: async () => ['orbit-shell-v4', 'orbit-static-v0', 'orbit-static-v1', 'another-app'], delete: async name => { deleted.push(name); return true; } };
  const self = { location: { origin: 'https://os.cosmibit.com' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  runInNewContext(workerSource, { self, caches, URL, Response, Promise, fetch: async request => { requests++; return reply(request, requests); } });
  return {
    get requests() { return requests; }, deleted, entries,
    async request(path, { method = 'GET', origin = 'https://os.cosmibit.com' } = {}) {
      let response;
      handlers.fetch({ request: { url: origin + path, method }, respondWith: value => { response = value; } });
      return response ? await response : undefined;
    },
    async activate() { let promise; handlers.activate({ waitUntil: value => { promise = value; } }); await promise; },
  };
}

test('private pages, APIs, auth and media never use service-worker caching', async () => {
  const worker = workerHarness();
  for (const path of ['/', '/?view=notes', '/api/state', '/api/state?rev=3', '/api/project-media?id=photo', '/login', '/auth/login', '/auth/logout', '/callback', '/sw.js']) {
    assert.equal(await worker.request(path), undefined, path);
  }
  assert.equal(await worker.request('/_next/static/chunks/a.js', { method: 'POST' }), undefined);
  assert.equal(await worker.request('/_next/static/chunks/a.js', { origin: 'https://evil.test' }), undefined);
  assert.equal(worker.requests, 0);
});
test('hashed bundles and icons are cache-first and fetched once', async () => {
  const worker = workerHarness({ reply: (_request, n) => new Response(`network-${n}`, { status: 200, headers: { 'Content-Type': 'text/javascript' } }) });
  for (const path of ['/_next/static/chunks/page-abc123.js', '/orbit-icon-v6-192.png', '/manifest.webmanifest?v=8']) {
    const first = await worker.request(path); const second = await worker.request(path);
    assert.equal(await first.text(), await second.text(), path);
  }
  assert.equal(worker.requests, 3);
});
test('login redirects, errors, HTML and no-store replies are never stored', async () => {
  for (const reply of [() => new Response('', { status: 401 }), () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }), () => new Response('x', { status: 200, headers: { 'Cache-Control': 'no-store' } }), () => new Response('x', { status: 404 })]) {
    const worker = workerHarness({ reply });
    await worker.request('/_next/static/chunks/a.js');
    assert.equal(worker.entries.size, 0);
  }
});
test('blocked cache storage falls back to the network', async () => {
  const worker = workerHarness({ brokenStorage: true });
  assert.equal(await (await worker.request('/_next/static/chunks/a.js')).text(), 'body');
});
test('activation keeps only the current static cache and unrelated caches', async () => {
  const worker = workerHarness();
  await worker.activate();
  assert.deepEqual(worker.deleted, ['orbit-shell-v4', 'orbit-static-v0']);
});

test('project tools are excluded from the initial static import graph', () => {
  const manifest = JSON.parse(readFileSync(new URL('../dist/client/.vite/manifest.json', import.meta.url), 'utf8'));
  const reachable = new Set();
  function walk(key) { if (reachable.has(key)) return; reachable.add(key); for (const imported of manifest[key]?.imports ?? []) walk(imported); }
  walk('app/page.tsx');
  assert.equal(reachable.has('app/projects/project-workspace.tsx'), false);
  assert.ok(manifest['app/page.tsx'].dynamicImports.includes('app/projects/project-workspace.tsx'));
  assert.ok(manifest['app/projects/project-workspace.tsx'].css.length > 0);
});
