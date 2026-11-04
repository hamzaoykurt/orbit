import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// /api/organize and /api/research-quiz run on the same provider layer as /api/ideas (Gemini first).
const url = (file, replacements = {}) => {
  let code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
};
const q = (value) => JSON.stringify(value);
const schemaUrl = url('../generation/schema.ts'), repoUrl = url('../generation/repository.ts', { "'./schema'": q(schemaUrl) });
const safeFetchUrl = url('../generation/safe-fetch.ts'), providerUrl = url('../generation/provider.ts', { "'./safe-fetch'": q(safeFetchUrl) });
const errorsUrl = url('../generation/provider-errors.ts'), contextUrl = url('../auth/context.ts');
const { authenticatedRequest } = await import(contextUrl);
const common = {
  "import { env } from 'cloudflare:workers';": 'const env = globalThis.__aiEnv;',
  "import { getDatabase } from '../../../db/client';": 'const getDatabase = () => globalThis.__aiDb;',
  "'../../../auth/context'": q(contextUrl), "'../../../generation/provider'": q(providerUrl), "'../../../generation/provider-errors'": q(errorsUrl), "'../../../generation/repository'": q(repoUrl),
};
globalThis.__aiEnv = {};
const organize = await import(url('../app/api/organize/route.ts', common));
const quiz = await import(url('../app/api/research-quiz/route.ts', common));

function database() {
  const sqlite = new DatabaseSync(':memory:');
  return { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async run() { const info = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(info.changes) } }; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; } }; } };
}
const realFetch = globalThis.fetch;
const geminiBody = (output) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] });
const geminiKeyInvalid = () => Response.json({ error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 });
const post = (path, body) => new Request(`https://orbit.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://orbit.test' }, body: JSON.stringify(body) });
const asOwner = (fn) => authenticatedRequest.run({ username: 'owner' }, fn);
const aiItem = { kind: 'buy', title: 'Monitör kolu', details: 'Masaya monitör kolu al', targetId: '', category: '', price: '1200', link: '', locationUrl: '', date: '', time: '', duration: '', tags: ['masa'], subtasks: [] };
const setEnv = (values) => { for (const key of Object.keys(globalThis.__aiEnv)) delete globalThis.__aiEnv[key]; Object.assign(globalThis.__aiEnv, values); };
test.beforeEach(() => { globalThis.__aiDb = database(); setEnv({}); });
test.after(() => { globalThis.fetch = realFetch; });

test('organize: Gemini answers through the shared provider layer and the output is re-validated', async () => {
  setEnv({ GEMINI_API_KEY: 'test-key' });
  let seen;
  globalThis.fetch = async (endpoint, options) => { seen = { endpoint: String(endpoint), body: JSON.parse(options.body) }; return geminiBody({ items: [aiItem, { kind: 'not-a-kind', title: 'x' }, { kind: 'note', title: '   ' }] }); };
  const response = await asOwner(() => organize.POST(post('/api/organize', { text: 'Monitör kolu al 1200 TL', context: {} })));
  const payload = await response.json();
  assert.equal(response.status, 200); assert.equal(payload.mode, 'ai');
  assert.deepEqual(payload.items.map((item) => item.title), ['Monitör kolu']);
  assert.match(seen.endpoint, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent/);
  assert.ok(!seen.endpoint.includes('test-key'));
});

test('organize: without a key or after a provider failure it says so (mode local + reason + notice), never silently', async () => {
  globalThis.fetch = async () => { throw new Error('no network expected'); };
  const noKey = await (await asOwner(() => organize.POST(post('/api/organize', { text: 'Yarın 14:00 toplantı' })))).json();
  assert.equal(noKey.mode, 'local'); assert.equal(noKey.reason, 'not_configured'); assert.match(noKey.notice, /AI anahtarı/); assert.ok(noKey.items.length >= 1);

  setEnv({ GEMINI_API_KEY: 'revoked-key' });
  globalThis.fetch = async () => geminiKeyInvalid();
  const bad = await (await asOwner(() => organize.POST(post('/api/organize', { text: 'Yarın 14:00 toplantı' })))).json();
  assert.equal(bad.mode, 'local'); assert.equal(bad.reason, 'provider-key-invalid'); assert.match(bad.notice, /GEMINI_API_KEY/);
  assert.doesNotMatch(JSON.stringify(bad), /revoked-key/);
});

test('organize: anonymous is refused and bad input is a 400', async () => {
  assert.equal((await organize.POST(post('/api/organize', { text: 'x' }))).status, 401);
  assert.equal((await asOwner(() => organize.POST(post('/api/organize', { text: '' })))).status, 400);
});

test('research-quiz: a revoked key is reported as such with its own status, not as a generic failure', async () => {
  setEnv({ GEMINI_API_KEY: 'revoked-key' });
  globalThis.fetch = async () => geminiKeyInvalid();
  const body = { title: 'Buz', mainQuestion: 'Buz neden kayar?', notes: [{ question: 'a', answer: 'b' }] };
  const response = await asOwner(() => quiz.POST(post('/api/research-quiz', body)));
  const payload = await response.json();
  assert.equal(response.status, 503); assert.equal(payload.code, 'provider-key-invalid'); assert.match(payload.error, /GEMINI_API_KEY/);
  const quota = await asOwner(async () => { globalThis.fetch = async () => new Response(null, { status: 429 }); return quiz.POST(post('/api/research-quiz', body)); });
  assert.equal(quota.status, 429);
});
