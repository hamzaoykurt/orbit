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
function workerHarness({ privateResponse = false, brokenStorage = false } = {}) {
  const handlers = {};
  const entries = new Map();
  const deleted = [];
  let requests = 0;
  const key = request => typeof request === 'string' ? request : request.url;
  const cache = { match: async request => entries.get(key(request))?.clone(), put: async (request, response) => { entries.set(key(request), response.clone()); }, add: async () => undefined };
  const caches = { open: async () => { if (brokenStorage) throw new Error('blocked'); return cache; }, match: cache.match, keys: async () => ['orbit-shell-v4', 'orbit-shell-v5', 'another-app'], delete: async name => { deleted.push(name); return true; } };
  const self = { location: { origin: 'https://os.cosmibit.com' }, addEventListener: (name, handler) => { handlers[name] = handler; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
  runInNewContext(workerSource, { self, caches, URL, Response, Promise, fetch: async () => { requests++; return new Response(`network-${requests}`, { headers: { 'Cache-Control': privateResponse ? 'private, no-store' : 'public, max-age=31536000, immutable' } }); } });
  return {
    get requests() { return requests; }, deleted,
    async request(path, mode = 'cors') {
      const promises = []; let response;
      handlers.fetch({ request: { url: 'https://os.cosmibit.com' + path, method: 'GET', mode }, respondWith: value => { response = value; }, waitUntil: value => promises.push(value) });
      const result = response ? await response : undefined;
      await Promise.all(promises);
      return result;
    },
    async activate() { let promise; handlers.activate({ waitUntil: value => { promise = value; } }); await promise; },
  };
}

test('private pages, bundles, APIs and auth never use service-worker caching', async () => {
  const worker = workerHarness();
  for (const path of ['/', '/_next/static/chunks/app-abc123.js', '/api/state', '/api/project-media?id=photo', '/login', '/auth/login', '/auth/logout', '/callback']) {
    assert.equal(await worker.request(path), undefined);
  }
  assert.equal(worker.requests, 0);
});
test('activation deletes all legacy Orbit caches and preserves unrelated caches', async () => {
  const worker = workerHarness();
  await worker.activate();
  assert.deepEqual(worker.deleted, ['orbit-shell-v4', 'orbit-shell-v5']);
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
