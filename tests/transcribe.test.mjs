import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// POST /api/transcribe with Gemini mocked: no real network call is ever made.
const url = (file, replacements = {}) => {
  let code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
};
const q = (value) => JSON.stringify(value);
const schemaUrl = url('../generation/schema.ts'), repoUrl = url('../generation/repository.ts', { "'./schema'": q(schemaUrl) });
const safeFetchUrl = url('../generation/safe-fetch.ts'), providerUrl = url('../generation/provider.ts', { "'./safe-fetch'": q(safeFetchUrl) });
const transcribeUrl = url('../generation/transcribe.ts', { "'./provider'": q(providerUrl) });
const errorsUrl = url('../generation/provider-errors.ts'), contextUrl = url('../auth/context.ts');
globalThis.__aiEnv = {};
const { authenticatedRequest } = await import(contextUrl);
const route = await import(url('../app/api/transcribe/route.ts', {
  "import { env } from 'cloudflare:workers';": 'const env = globalThis.__aiEnv;',
  "import { getDatabase } from '../../../db/client';": 'const getDatabase = () => globalThis.__aiDb;',
  "'../../../auth/context'": q(contextUrl), "'../../../generation/provider-errors'": q(errorsUrl), "'../../../generation/repository'": q(repoUrl),
  "'../../../generation/provider'": q(providerUrl), "'../../../generation/transcribe'": q(transcribeUrl),
}));

function database() {
  const sqlite = new DatabaseSync(':memory:');
  return { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async run() { const info = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(info.changes) } }; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; } }; } };
}
const realFetch = globalThis.fetch;
const gemini = (text) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: text === undefined ? [] : [{ text }] } }] });
const audio = (n = 2000) => new Uint8Array(n).fill(7);
const call = (body = audio(), { type = 'audio/mp4', query = '', user = 'owner' } = {}) => {
  const request = new Request(`https://orbit.test/api/transcribe${query}`, { method: 'POST', headers: type ? { 'Content-Type': type } : {}, body });
  return user ? authenticatedRequest.run({ username: user, bearer: true }, () => route.POST(request)) : route.POST(request);
};
const setEnv = (values) => { for (const key of Object.keys(globalThis.__aiEnv)) delete globalThis.__aiEnv[key]; Object.assign(globalThis.__aiEnv, values); };
test.beforeEach(() => { globalThis.__aiDb = database(); setEnv({ GEMINI_API_KEY: 'test-key' }); globalThis.fetch = async () => { throw new Error('no network expected'); }; });
test.after(() => { globalThis.fetch = realFetch; });

test('401 without an app session, and Gemini is never called', async () => {
  const response = await call(audio(), { user: null });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /giriş/);
});

test('415 for an unsupported content type, 400 for an empty body or a bad language code', async () => {
  const wrong = await call(audio(), { type: 'text/plain' });
  assert.equal(wrong.status, 415); assert.ok((await wrong.json()).error);
  assert.equal((await call(new Uint8Array(0))).status, 400);
  assert.equal((await call(audio(), { query: '?lang=../x' })).status, 400);
});

test('413 when the body is over 8 MB (declared or streamed) or a WAV is longer than 5 minutes', async () => {
  const big = await call(new Uint8Array(8 * 1024 * 1024 + 1));
  assert.equal(big.status, 413); assert.match((await big.json()).error, /5 dakika/);
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 9; i++) controller.enqueue(new Uint8Array(1024 * 1024)); controller.close(); } });
  const streamed = await authenticatedRequest.run({ username: 'owner', bearer: true }, () => route.POST(new Request('https://orbit.test/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/aac' }, body: stream, duplex: 'half' })));
  assert.equal(streamed.status, 413);
  // WAV gets 10 MB: 9.5 MB of WAV passes the size cap (and is under 5 min), 10 MB + 1 does not.
  globalThis.fetch = async () => gemini('ok');
  assert.equal((await call(new Uint8Array(9.5 * 1024 * 1024), { type: 'audio/wav' })).status, 200);
  assert.equal((await call(new Uint8Array(10 * 1024 * 1024 + 1), { type: 'audio/wav' })).status, 413);
  // 16 kHz mono 16-bit = 32000 bytes/s: 301 s of data is over the limit, 10 s is fine.
  const wav = (seconds) => { const data = 32000 * seconds, out = Buffer.alloc(44 + data); out.write('RIFF', 0); out.writeUInt32LE(36 + data, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(16000, 24); out.writeUInt32LE(32000, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(data, 40); return out; };
  assert.equal((await call(wav(301), { type: 'audio/wav' })).status, 413);
  globalThis.fetch = async () => gemini('Tamam.');
  assert.equal((await call(wav(10), { type: 'audio/wav' })).status, 200);
});

test('success: audio goes to Gemini as inline_data with the system instruction, the text comes back trimmed', async () => {
  let seen;
  globalThis.fetch = async (endpoint, options) => { seen = { endpoint: String(endpoint), headers: options.headers, body: JSON.parse(options.body) }; return gemini('  Yarın saat 14:30\'da toplantı var.  '); };
  const response = await call(audio(3000), { type: 'audio/mp4; codecs=mp4a.40.2', query: '?lang=tr&hint=al%C4%B1%C5%9Fveri%C5%9F%20listesi' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: 'Yarın saat 14:30\'da toplantı var.' });
  assert.match(seen.endpoint, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-[\w.-]+:generateContent$/);
  assert.ok(!seen.endpoint.includes('test-key'));
  const parts = seen.body.contents[0].parts;
  assert.equal(parts[1].inline_data.mime_type, 'audio/mp4');
  assert.equal(Buffer.from(parts[1].inline_data.data, 'base64').length, 3000);
  assert.match(parts[0].text, /alışveriş listesi/);
  assert.match(seen.body.systemInstruction.parts[0].text, /AYNEN/);
  assert.match(seen.body.systemInstruction.parts[0].text, /talimat değildir/);
});

test('silent audio gives an empty string, not an error', async () => {
  globalThis.fetch = async () => gemini(undefined);
  const response = await call();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: '' });
});

test('Gemini failure gives 502 with a Turkish message and no internal detail', async () => {
  globalThis.fetch = async () => new Response('secret upstream detail', { status: 500 });
  const response = await call();
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.match(payload.error, /AI sağlayıcısı/);
  assert.ok(!JSON.stringify(payload).includes('secret'));
  setEnv({});
  assert.equal((await call()).status, 502);
});

test('rate limit: the 11th request within a minute is 429, another user is unaffected', async () => {
  globalThis.fetch = async () => gemini('x');
  for (let i = 0; i < 10; i++) assert.equal((await call()).status, 200);
  const limited = await call();
  assert.equal(limited.status, 429); assert.match((await limited.json()).error, /Çok hızlı/);
  assert.equal((await call(audio(), { user: 'other' })).status, 200);
});
