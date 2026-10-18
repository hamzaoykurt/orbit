import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadModuleUrl } from './load-module.mjs';

const safeUrl = loadModuleUrl(new URL('../generation/safe-fetch.ts', import.meta.url));
let code = ts.transpileModule(readFileSync(new URL('../app/api/hub/web-fetch.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
code = code.replace(/from '\.\.\/\.\.\/\.\.\/generation\/safe-fetch'/, `from ${JSON.stringify(safeUrl)}`);
const { requestText, isUnreadable, unreadableAnalysis, UNREADABLE_NOTICE, BROWSER_HEADERS, SourceError } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const sequence = (...responses) => { const calls = []; return { calls, transport: async (url, init) => { calls.push({ url: String(url), headers: init.headers }); return responses[Math.min(calls.length - 1, responses.length - 1)](); } }; };
const res = (status, headers = {}, body = 'ok') => () => new Response(status === 204 ? null : body, { status, headers });

test('web requests carry browser-like headers; callers can still override', async () => {
  const { transport, calls } = sequence(res(200));
  await requestText('https://r.jina.ai/https://swishy.ai/', { Accept: 'text/plain' }, { transport });
  assert.equal(calls[0].headers['User-Agent'], BROWSER_HEADERS['User-Agent']);
  assert.match(calls[0].headers['Accept-Language'], /^tr/);
  assert.equal(calls[0].headers.accept ?? calls[0].headers.Accept, 'text/plain');
});

test('429 with a short Retry-After is retried once', async () => {
  const slept = [];
  const { transport, calls } = sequence(res(429, { 'retry-after': '2' }), res(200, {}, 'hello'));
  assert.equal(await requestText('https://x.example/', {}, { transport, sleep: async ms => { slept.push(ms); } }), 'hello');
  assert.equal(calls.length, 2); assert.deepEqual(slept, [2000]);
});

test('429 with a long Retry-After or after the retry surfaces as a recoverable SourceError', async () => {
  const long = sequence(res(429, { 'retry-after': '30' }));
  await assert.rejects(requestText('https://x.example/', {}, { transport: long.transport, sleep: async () => {} }), error => error instanceof SourceError && error.status === 429 && isUnreadable(error));
  assert.equal(long.calls.length, 1);
  const twice = sequence(res(429, { 'retry-after': '1' }));
  await assert.rejects(requestText('https://x.example/', {}, { transport: twice.transport, sleep: async () => {} }), /429/);
  assert.equal(twice.calls.length, 2);
});

test('403, 5xx, timeouts and network errors are unreadable; 404 and validation errors are not', async () => {
  for (const status of [403, 429, 500, 503]) assert.equal(isUnreadable(new SourceError(status)), true, String(status));
  assert.equal(isUnreadable(new SourceError(404)), false);
  assert.equal(isUnreadable(new TypeError('fetch failed')), true);
  assert.equal(isUnreadable(Object.assign(new Error('t'), { name: 'TimeoutError' })), true);
  assert.equal(isUnreadable(new Error('Geçerli bir GitHub adresi gerekli.')), false);
});

test('a blocked page still yields a saveable link named after the host', () => {
  const result = unreadableAnalysis(new URL('https://www.swishy.ai/'), 'web');
  assert.equal(result.title, 'swishy.ai');
  assert.equal(result.url, 'https://www.swishy.ai/');
  assert.equal(result.summary, 'İçerik otomatik okunamadı.');
  assert.equal(result.notice, UNREADABLE_NOTICE);
  assert.deepEqual([result.categories, result.images, result.embedded], [[], [], []]);
});
