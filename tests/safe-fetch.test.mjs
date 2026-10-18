import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { fetchFollowingRedirects, isInternalHost } = await import(loadModuleUrl(new URL('../generation/safe-fetch.ts', import.meta.url)));

const redirect = (status, location) => new Response(null, { status, headers: location ? { location } : {} });
const scripted = (routes) => {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url: String(url), redirect: init.redirect, method: init.method });
    const handler = routes[String(url)];
    if (!handler) throw new Error('unexpected ' + url);
    return typeof handler === 'function' ? handler(init) : handler.clone();
  };
  return { transport, calls };
};

test('redirects are followed by hand and never use redirect:error', async () => {
  const { transport, calls } = scripted({
    'https://a.example/start': redirect(301, '/middle'),
    'https://a.example/middle': redirect(302, 'https://b.example/end'),
    'https://b.example/end': new Response('ok', { status: 200 }),
  });
  const response = await fetchFollowingRedirects('https://a.example/start', {}, { transport });
  assert.equal(await response.text(), 'ok');
  assert.deepEqual(calls.map(call => call.url), ['https://a.example/start', 'https://a.example/middle', 'https://b.example/end']);
  assert.ok(calls.every(call => call.redirect === 'manual'));
});

test('a redirect to an internal or metadata address is refused', async () => {
  for (const target of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://[::1]/', 'http://intranet.internal/', 'file:///etc/passwd']) {
    const { transport, calls } = scripted({ 'https://a.example/': redirect(302, target) });
    await assert.rejects(fetchFollowingRedirects('https://a.example/', {}, { transport }), /Yönlendirme/, target);
    assert.equal(calls.length, 1, `no request made to ${target}`);
  }
});

test('redirect chains are capped and missing Location is an error', async () => {
  const routes = {};
  for (let i = 0; i < 10; i++) routes[`https://a.example/${i}`] = redirect(302, `/${i + 1}`);
  await assert.rejects(fetchFollowingRedirects('https://a.example/0', {}, { transport: scripted(routes).transport }), /Çok fazla yönlendirme/);
  await assert.rejects(fetchFollowingRedirects('https://a.example/', {}, { transport: scripted({ 'https://a.example/': redirect(302) }).transport }), /adresi alınamadı/);
});

test('same-origin mode keeps credentials from leaving the provider host; 307 keeps the POST', async () => {
  const seen = [];
  const { transport } = scripted({
    'https://api.example/v1/responses': redirect(307, '/v1/other'),
    'https://api.example/v1/other': (init) => { seen.push(init.method + ':' + init.body); return new Response('{}'); },
  });
  await fetchFollowingRedirects('https://api.example/v1/responses', { method: 'POST', body: 'x' }, { transport, sameOriginOnly: true });
  assert.deepEqual(seen, ['POST:x']);
  const away = scripted({ 'https://api.example/v1/responses': redirect(307, 'https://evil.example/') });
  await assert.rejects(fetchFollowingRedirects('https://api.example/v1/responses', { method: 'POST', body: 'x' }, { transport: away.transport, sameOriginOnly: true }), /başka bir kaynağa/);
  assert.equal(away.calls.length, 1);
});

test('internal host detection', () => {
  for (const host of ['localhost', 'a.localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '0.0.0.0', '[::1]', 'fd00::1', '::ffff:127.0.0.1', '2130706433', 'x.local']) assert.equal(isInternalHost(host), true, host);
  for (const host of ['prompt-motion.com', 'r.jina.ai', '8.8.8.8', '172.32.0.1', 'api.github.com']) assert.equal(isInternalHost(host), false, host);
});
