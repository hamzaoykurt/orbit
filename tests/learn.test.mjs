import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// /api/english/* and /api/islam/*: pure rules, source parsing and every route through the real handlers, with an in-memory
// SQLite database, a fake KV and a stubbed fetch (Gemini, AlQuran Cloud and jsDelivr). No network, no secrets.
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/learn-sources.json', import.meta.url), 'utf8'));
const cache = new Map();
const load = (file) => {
  const key = file.href;
  if (cache.has(key)) return cache.get(key);
  let code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace("import { env } from 'cloudflare:workers';", 'const env = new Proxy({}, { get: (_, key) => globalThis.__learnEnv[key] });');
  code = code.replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, path) => `from ${JSON.stringify(load(new URL(`${path}.ts`, file)))}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(key, url);
  return url;
};
const mod = (path) => import(load(new URL(path, import.meta.url)));
globalThis.__learnEnv = {};
const { authenticatedRequest } = await mod('../auth/context.ts');
const english = await mod('../learn/english.ts'), quran = await mod('../learn/quran-source.ts'), hadith = await mod('../learn/hadith-source.ts');
const curriculum = await mod('../learn/islam-curriculum.ts'), islamAi = await mod('../learn/islam-ai.ts');
const routes = {
  flow: await mod('../app/api/english/flow/route.ts'), chat: await mod('../app/api/english/chat/route.ts'), correct: await mod('../app/api/english/correct/route.ts'),
  reading: await mod('../app/api/english/reading/route.ts'), placement: await mod('../app/api/english/placement/route.ts'),
  curriculum: await mod('../app/api/islam/curriculum/route.ts'), verse: await mod('../app/api/islam/verse/route.ts'), hadith: await mod('../app/api/islam/hadith/route.ts'),
  explain: await mod('../app/api/islam/explain/route.ts'), quiz: await mod('../app/api/islam/quiz/route.ts'),
};

function database() {
  const sqlite = new DatabaseSync(':memory:');
  return { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async run() { const info = sqlite.prepare(sql).run(...args); return { success: true, meta: { changes: Number(info.changes) } }; }, async first() { return sqlite.prepare(sql).get(...args) || null; }, async all() { return { success: true, results: sqlite.prepare(sql).all(...args) }; } }; } };
}
const kv = () => { const map = new Map(); return { map, get: async (key) => map.get(key) ?? null, put: async (key, value) => { map.set(key, value); } }; };
const realFetch = globalThis.fetch;
const queue = []; // model outputs, consumed in order
let calls, sourceMode;
const geminiBody = (output) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] });
function stubFetch() {
  calls = { model: 0, quran: 0, hadith: 0, urls: [] };
  sourceMode = 'ok';
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input); calls.urls.push(url);
    if (url.includes('generativelanguage.googleapis.com')) { calls.model++; calls.lastModelBody = JSON.parse(options.body); if (!queue.length) throw new Error('no model output queued'); const next = queue.shift(); return next instanceof Response ? next : geminiBody(next); }
    if (url.includes('api.alquran.cloud')) {
      calls.quran++;
      if (sourceMode === 'down') return new Response('x', { status: 503 });
      const match = /surah\/(\d+)\/editions\/[^?]+\?offset=(\d+)&limit=(\d+)/.exec(url);
      const data = fixtures.surahs[Number(match[1])];
      if (!data) return Response.json({ code: 404, data: [] }, { status: 404 });
      const [offset, limit] = [Number(match[2]), Number(match[3])];
      const sliced = data.map((edition) => ({ ...edition, ayahs: edition.ayahs.slice(offset, offset + limit) }));
      if (sourceMode === 'wrong-ayah') sliced[1].ayahs = sliced[1].ayahs.map((ayah) => ({ ...ayah, numberInSurah: ayah.numberInSurah + 1 }));
      return Response.json({ code: 200, status: 'OK', data: sliced });
    }
    if (url.includes('cdn.jsdelivr.net')) {
      calls.hadith++;
      if (sourceMode === 'down') return new Response('x', { status: 503 });
      const match = /editions\/(ara|tur)-nawawi\/(\d+)\.json/.exec(url);
      const entry = fixtures.hadith[Number(match[2])];
      if (!entry) return new Response('missing', { status: 404 });
      const hadiths = entry[match[1]].map((item) => sourceMode === 'wrong-number' ? { ...item, hadithnumber: 99 } : item);
      return Response.json({ metadata: {}, hadiths });
    }
    throw new Error(`unexpected request ${url}`);
  };
}
let db, store;
test.beforeEach(() => { db = database(); store = kv(); queue.length = 0; globalThis.__learnEnv = { DB: db, MEDIA: store, GEMINI_API_KEY: 'test-key' }; stubFetch(); });
test.after(() => { globalThis.fetch = realFetch; });

const post = (path, body, headers = {}) => new Request(`https://orbit.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://orbit.test', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (path) => new Request(`https://orbit.test${path}`);
const as = (fn, context = { username: 'owner' }) => authenticatedRequest.run(context, fn);
const call = async (handler, request, context) => { const response = await as(() => handler(request), context); return { status: response.status, body: await response.json() }; };

const flowOutput = (overrides = {}) => ({
  phrases: [
    { text: 'Could you give me a hand with this?', tr: 'Bana bu konuda yardım edebilir misin?', usage: 'Birinden nazikçe yardım isterken.', a: 'Could you give me a hand with this?', b: 'Sure, what do you need?' },
    { text: 'I was wondering if you could help', tr: 'Yardım edebilir misiniz diye düşünüyordum.', usage: 'Daha resmi ve kibar rica için.', a: 'I was wondering if you could help.', b: 'Of course.' },
    { text: 'Do you mind if I ask something?', tr: 'Bir şey sormamın sakıncası var mı?', usage: 'Soru sormadan önce izin alırken.', a: 'Do you mind if I ask something?', b: 'Go ahead.' },
  ],
  speaking: { title: 'Ofiste yardım iste', setting: 'A busy office on Monday morning.', aiRole: 'a friendly colleague', userRole: 'a new employee', goal: 'Bir iş arkadaşından nazikçe yardım iste.', opening: 'Morning! You look busy. What do you need?' },
  writing: { prompt: 'Write two sentences asking a colleague for help.', promptTr: 'Bir iş arkadaşından yardım isteyen iki cümle yaz.' },
  readingTopic: 'How offices shape teamwork',
  ...overrides,
});

// ------------------------------------------------------------------ placement test
async function runPlacement(pickChoice) {
  const answers = [];
  for (let step = 0; step < 8; step++) {
    const { status, body } = await call(routes.placement.POST, post('/api/english/placement', { answers }));
    assert.equal(status, 200); assert.equal(body.done, false); assert.equal(body.step, step + 1);
    assert.equal(Object.hasOwn(body.question, 'answer'), false, 'the correct answer must never be sent');
    assert.equal(Object.hasOwn(body.question, 'level'), false);
    answers.push({ id: body.question.id, choice: pickChoice(body.question) });
  }
  return call(routes.placement.POST, post('/api/english/placement', { answers }));
}
const bank = (await mod('../learn/placement-bank.ts')).PLACEMENT_BANK;
const correctFor = (question) => bank.find((item) => item.id === question.id).answer;
const wrongFor = (question) => (correctFor(question) + 1) % 3;

test('placement: all correct answers reach B2, all wrong ones A1, and the first question is A2', async () => {
  const first = await call(routes.placement.POST, post('/api/english/placement', {}));
  assert.equal((await routes.placement.POST(post('/api/english/placement', {}))).status, 401);
  assert.equal(first.body.question.id.startsWith('pl-a2-'), true); assert.equal(first.body.total, 8);
  const top = await runPlacement(correctFor);
  assert.equal(top.body.done, true); assert.equal(top.body.result.cefr, 'B2'); assert.equal(top.body.result.correct, 8); assert.equal(top.body.result.approximate, true);
  const bottom = await runPlacement(wrongFor);
  assert.equal(bottom.body.result.cefr, 'A1'); assert.equal(bottom.body.result.correct, 0);
  const mixed = await runPlacement((question) => question.id.startsWith('pl-b1') || question.id.startsWith('pl-a') ? correctFor(question) : wrongFor(question));
  assert.ok(['A2', 'B1'].includes(mixed.body.result.cefr), `mixed answers land in the middle, got ${mixed.body.result.cefr}`);
  assert.equal(mixed.body.result.review.length, 8);
});

test('placement: a forged, repeated or out-of-order answer list is refused with 400 invalid-request', async () => {
  const first = (await call(routes.placement.POST, post('/api/english/placement', {}))).body.question;
  const cases = [
    { answers: [{ id: 'pl-b2-r1', choice: 0 }] }, // skipping the staircase
    { answers: [{ id: first.id, choice: 7 }] }, // option out of range
    { answers: [{ id: first.id, choice: 0 }, { id: first.id, choice: 0 }] }, // repeated question
    { answers: [{ id: 'nope', choice: 0 }] }, { answers: 'x' }, { answers: Array.from({ length: 9 }, () => ({ id: first.id, choice: 0 })) },
  ];
  for (const body of cases) { const { status, body: error } = await call(routes.placement.POST, post('/api/english/placement', body)); assert.equal(status, 400); assert.equal(error.code, 'invalid-request'); assert.equal(typeof error.error, 'string'); }
});

// ------------------------------------------------------------------ English: pure validators
test('english: phrase ids are stable, patterns need 2+ words and repeats of known phrases are dropped', () => {
  assert.equal(english.phraseId('Could you give me a hand?'), english.phraseId('could you  GIVE me a hand'));
  assert.notEqual(english.phraseId('Could you give me a hand?'), english.phraseId('Can I pay by card?'));
  const known = ['could you give me a hand with this'];
  assert.equal(english.parseFlow(flowOutput(), known), null, 'a known phrase leaves fewer than 3 patterns');
  assert.equal(english.parseFlow(flowOutput({ phrases: flowOutput().phrases.map((phrase, index) => index === 0 ? { ...phrase, text: 'Hello' } : phrase) }), []), null, 'a single word is not a pattern');
  const ok = english.parseFlow(flowOutput(), []);
  assert.equal(ok.phrases.length, 3); assert.deepEqual(ok.speaking.usePhraseIds, ok.phrases.map((phrase) => phrase.id));
});

test('english: feedback keeps only mistakes and phrases that the learner really produced', () => {
  const user = ['I go to cafe yesterday.', 'Could you give me a hand?'];
  const parsed = english.parseFeedback({
    corrections: [{ original: 'I go to cafe yesterday.', corrected: 'I went to the cafe yesterday.', reasonTr: 'Geçmiş zaman gerekir.' }, { original: 'She have a dog', corrected: 'She has a dog', reasonTr: 'Uydurma.' }],
    natural: { original: 'Could you give me a hand?', better: 'Could you give me a hand?' }, usedPhrases: ['Could you give me a hand with this?', 'Not in the list at all'], summaryTr: 'İyi gittin.',
  }, user, ['Could you give me a hand with this?', 'Do you mind if I ask something?']);
  assert.equal(parsed.corrections.length, 1); assert.equal(parsed.corrections[0].original, 'I go to cafe yesterday.');
  assert.equal(parsed.natural, null, 'an identical "better" version is not a suggestion');
  assert.deepEqual(parsed.usedPhrases, ['Could you give me a hand with this?']);
});

test('english: a correction must quote the learner text; a clean text is perfect and unchanged', () => {
  const original = 'I go to school yesterday. It was fun.';
  const out = english.parseCorrection({ corrected: 'I went to school yesterday. It was fun.', changes: [{ from: 'I go', to: 'I went', type: 'tense', reasonTr: 'Dün geçmiş zaman ister.' }, { from: 'He have', to: 'He has', type: 'agreement', reasonTr: 'x' }, { from: 'It was', to: 'It was', type: 'other', reasonTr: 'x' }], naturalVersion: '', praiseTr: 'Güzel.' }, original);
  assert.equal(out.changes.length, 1); assert.equal(out.perfect, false);
  const clean = english.parseCorrection({ corrected: 'It was fun.', changes: [], naturalVersion: '', praiseTr: 'Güzel.' }, 'It was fun.');
  assert.equal(clean.perfect, true); assert.deepEqual(clean.changes, []);
});

test('english: reading is validated (length, 3 questions, glossary words occur in the text) and answer positions are shuffled without changing the answer', () => {
  const text = Array.from({ length: 125 }, (_, index) => ['coffee', 'travels', 'quietly', 'across', 'many', 'old', 'trade', 'routes'][index % 8]).join(' ') + '.';
  const raw = { title: 'Coffee roads', text, questions: [0, 1, 2].map((index) => ({ prompt: `Question ${index}?`, options: ['alpha', 'beta', 'gamma'], answerIndex: index, explanationTr: 'Metinde geçer.' })), glossary: [{ word: 'coffee', tr: 'kahve' }, { word: 'routes', tr: 'yollar' }, { word: 'quietly', tr: 'sessizce' }, { word: 'absent', tr: 'yok' }] };
  const seeds = [0.1, 0.5, 0.9];
  const parsed = english.parseReading(raw, 'A2', () => seeds.shift() ?? 0.3);
  assert.equal(parsed.questions.length, 3); assert.deepEqual(parsed.glossary.map((entry) => entry.word), ['coffee', 'routes', 'quietly']);
  parsed.questions.forEach((question, index) => assert.equal(question.options[question.answerIndex], ['alpha', 'beta', 'gamma'][index]));
  assert.equal(english.parseReading({ ...raw, text: 'Too short.' }, 'A2'), null);
  assert.equal(english.parseReading({ ...raw, questions: raw.questions.slice(0, 2) }, 'A2'), null);
  assert.equal(english.parseReading({ ...raw, glossary: raw.glossary.slice(3) }, 'A2'), null);
});

// ------------------------------------------------------------------ English: routes
const aiTurn = { reply: 'Sure! What do you need help with?', hint: 'Could you give me a hand with this?' };
const scenario = { title: 'Ofiste yardım iste', setting: 'A busy office.', aiRole: 'a colleague', userRole: 'a new employee', goal: 'Yardım iste.' };

test('flow: returns the daily routine with the XP rules; invalid input is 400; no session is 401; a forged origin is 403', async () => {
  queue.push(flowOutput());
  const { status, body } = await call(routes.flow.POST, post('/api/english/flow', { level: 'B1', day: '2026-11-07', knownPhrases: ['Can I pay by card?'], interests: ['space'] }));
  assert.equal(status, 200);
  assert.equal(body.level, 'B1'); assert.equal(body.day, '2026-11-07'); assert.equal(body.phrases.length, 3); assert.match(body.phrases[0].id, /^ph-[0-9a-f]{8}$/);
  assert.equal(body.reading.topic, 'How offices shape teamwork'); assert.equal(body.writing.minSentences, 2); assert.deepEqual(body.xp, { pattern: 10, speaking: 30, writing: 20, reading: 20, dailyBonus: 10, streakMinStops: 2 });
  assert.deepEqual(body.minutes, { phrases: 3, speaking: 3, writing: 2, reading: 2 });
  const sent = JSON.parse(calls.lastModelBody.contents[0].parts[0].text);
  assert.equal(sent.level, 'B1'); assert.deepEqual(sent.knownPhrases, ['Can I pay by card?']); assert.ok(sent.situation);
  for (const bad of [{ level: 'C2' }, { level: 'A2', day: '2026-02-31' }, { knownPhrases: 'x' }, { interests: Array.from({ length: 6 }, () => 'x') }, '[]', 'not json']) {
    const result = await call(routes.flow.POST, post('/api/english/flow', bad)); assert.equal(result.status, 400, JSON.stringify(bad)); assert.equal(result.body.code, 'invalid-request');
  }
  assert.equal((await routes.flow.POST(post('/api/english/flow', {}))).status, 401);
  const forged = await call(routes.flow.POST, post('/api/english/flow', {}, { Origin: 'https://evil.test' })); assert.equal(forged.status, 403); assert.equal(forged.body.code, 'forbidden-origin');
  const bearer = await call(routes.flow.POST, new Request('https://orbit.test/api/english/flow', { method: 'POST', body: '{}' }), { username: 'owner', bearer: true });
  assert.equal(bearer.status, 503, 'a bearer app call without Origin passes the origin check (the model queue is empty here)');
});

test('flow: a model output that repeats a known phrase is retried once, then reported as invalid-output', async () => {
  const repeated = flowOutput();
  const fixed = { ...repeated, phrases: [repeated.phrases[0], repeated.phrases[1], { ...repeated.phrases[2], text: 'How long does it take to get there?' }] };
  const known = ['Do you mind if I ask something?'];
  queue.push(repeated, fixed);
  const retried = await call(routes.flow.POST, post('/api/english/flow', { level: 'A2', knownPhrases: known }));
  assert.equal(retried.status, 200); assert.equal(calls.model, 2); assert.ok(retried.body.phrases.every((phrase) => phrase.text !== known[0]));
  queue.push(repeated, repeated);
  const bad = await call(routes.flow.POST, post('/api/english/flow', { level: 'A2', knownPhrases: known }));
  assert.equal(bad.status, 503); assert.equal(bad.body.code, 'invalid-output'); assert.equal(typeof bad.body.error, 'string');
});

test('english routes: without a key they answer 503 not_configured; provider quota is 429; the rate limit allows 20 calls a minute', async () => {
  globalThis.__learnEnv = { DB: db, MEDIA: store };
  const missing = await call(routes.flow.POST, post('/api/english/flow', {})); assert.equal(missing.status, 503); assert.equal(missing.body.code, 'not_configured');
  globalThis.__learnEnv = { DB: db, MEDIA: store, GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-x' };
  queue.push(new Response('quota', { status: 429 }));
  const quota = await call(routes.flow.POST, post('/api/english/flow', {})); assert.equal(quota.status, 429); assert.equal(quota.body.code, 'provider-quota');
  let limited;
  for (let index = 0; index < 45; index++) { queue.push(new Response('quota', { status: 429 })); limited = await call(routes.flow.POST, post('/api/english/flow', {})); if (limited.body.code === 'rate-limited') break; }
  assert.equal(limited.status, 429); assert.equal(limited.body.code, 'rate-limited');
});

test('chat: a turn returns the AI reply and a hint; the last message must be the learner\'s; bad shapes are 400', async () => {
  queue.push(aiTurn);
  const messages = [{ role: 'ai', text: 'Morning! What do you need?' }, { role: 'user', text: 'I need help with this report.' }];
  const { status, body } = await call(routes.chat.POST, post('/api/english/chat', { level: 'A2', scenario, messages, phrases: ['Could you give me a hand with this?'], turn: 6 }));
  assert.equal(status, 200); assert.equal(body.reply, aiTurn.reply); assert.equal(body.hint, aiTurn.hint); assert.equal(body.turn, 6); assert.equal(body.endSuggested, true);
  const sent = JSON.parse(calls.lastModelBody.contents[0].parts[0].text);
  assert.deepEqual(sent.messages, messages);
  const bad = [
    { level: 'A2', scenario, messages: [{ role: 'user', text: 'Hi' }, { role: 'ai', text: 'Hello' }] }, // last must be the learner
    { level: 'A2', scenario, messages: [] }, { level: 'A2', scenario, messages: [{ role: 'bot', text: 'x' }] }, { level: 'A2', scenario: { title: 'x' }, messages }, { level: 'Z9', scenario, messages },
    { level: 'A2', scenario, messages: Array.from({ length: 13 }, () => ({ role: 'user', text: 'x' })) },
    { level: 'A2', scenario, messages: [{ role: 'user', text: 'x'.repeat(401) }] },
  ];
  for (const payload of bad) { const result = await call(routes.chat.POST, post('/api/english/chat', payload)); assert.equal(result.status, 400, JSON.stringify(payload).slice(0, 80)); assert.equal(result.body.code, 'invalid-request'); }
  assert.equal((await routes.chat.POST(post('/api/english/chat', {}))).status, 401);
});

test('chat: only the last 8 messages reach the model, and finishing returns grounded feedback with XP', async () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'ai' : 'user', text: `message ${index}` })).slice(0, 11);
  queue.push(aiTurn);
  await call(routes.chat.POST, post('/api/english/chat', { level: 'B1', scenario, messages: history }));
  assert.equal(JSON.parse(calls.lastModelBody.contents[0].parts[0].text).messages.length, 8);
  const conversation = [{ role: 'ai', text: 'Hi!' }, { role: 'user', text: 'I go to cafe yesterday.' }, { role: 'ai', text: 'Nice!' }, { role: 'user', text: 'Could you give me a hand with this?' }, { role: 'ai', text: 'Sure.' }, { role: 'user', text: 'Thanks a lot.' }];
  queue.push({ corrections: [{ original: 'I go to cafe yesterday.', corrected: 'I went to the cafe yesterday.', reasonTr: 'Geçmiş zaman.' }, { original: 'invented mistake', corrected: 'fixed', reasonTr: 'x' }], natural: { original: '', better: '' }, usedPhrases: ['Could you give me a hand with this?'], summaryTr: 'Güzel bir konuşmaydı.' });
  const done = await call(routes.chat.POST, post('/api/english/chat', { level: 'A2', scenario, messages: conversation, phrases: ['Could you give me a hand with this?'], finish: true }));
  assert.equal(done.status, 200); assert.equal(done.body.feedback.corrections.length, 1); assert.deepEqual(done.body.feedback.usedPhrases, ['Could you give me a hand with this?']); assert.equal(done.body.xp, 30); assert.equal(done.body.userTurns, 3);
  queue.push({ corrections: [], natural: { original: '', better: '' }, usedPhrases: [], summaryTr: 'Başlangıç için iyi.' });
  const short = await call(routes.chat.POST, post('/api/english/chat', { level: 'A2', scenario, messages: conversation.slice(0, 2), finish: true }));
  assert.equal(short.body.xp, 10);
  const nothing = await call(routes.chat.POST, post('/api/english/chat', { level: 'A2', scenario, messages: [{ role: 'ai', text: 'Hi' }], finish: true }));
  assert.equal(nothing.status, 400);
});

test('correct: returns the original, the fix and one Turkish reason per mistake; invented changes are dropped', async () => {
  queue.push({ corrected: 'I went to school yesterday. It was fun.', changes: [{ from: 'I go', to: 'I went', type: 'tense', reasonTr: 'Dün geçmiş zaman ister.' }, { from: 'phantom', to: 'real', type: 'other', reasonTr: 'x' }], naturalVersion: 'Yesterday I went to school and it was fun.', praiseTr: 'Cümlelerin anlaşılır.' });
  const { status, body } = await call(routes.correct.POST, post('/api/english/correct', { level: 'A2', prompt: 'Write about yesterday.', text: 'I go to school yesterday. It was fun.' }));
  assert.equal(status, 200); assert.equal(body.original, 'I go to school yesterday. It was fun.'); assert.equal(body.corrected, 'I went to school yesterday. It was fun.');
  assert.equal(body.changes.length, 1); assert.equal(body.changes[0].type, 'tense'); assert.equal(body.perfect, false); assert.equal(body.sentences, 2); assert.equal(body.xp, 20);
  for (const bad of [{ level: 'A2', text: '' }, { level: 'A2', text: '12 34' }, { level: 'A2', text: 'x'.repeat(601) }, { level: 'nope', text: 'Hello there' }, { level: 'A2' }]) {
    const result = await call(routes.correct.POST, post('/api/english/correct', bad)); assert.equal(result.status, 400); assert.equal(result.body.code, 'invalid-request');
  }
  assert.equal((await routes.correct.POST(post('/api/english/correct', { level: 'A2', text: 'Hi there' }))).status, 401);
});

test('reading: returns title, text, 3 questions with answers and a glossary; XP 20', async () => {
  const text = Array.from({ length: 120 }, (_, index) => ['tea', 'grows', 'slowly', 'in', 'cool', 'hills', 'and', 'people', 'drink', 'it'][index % 10]).join(' ') + '.';
  queue.push({ title: 'Tea hills', text, questions: [0, 1, 2].map((index) => ({ prompt: `Q${index}?`, options: ['one', 'two', 'three'], answerIndex: index, explanationTr: 'Metinde.' })), glossary: ['tea', 'hills', 'slowly', 'people', 'drink'].map((word) => ({ word, tr: 'çeviri' })) });
  const { status, body } = await call(routes.reading.POST, post('/api/english/reading', { level: 'A2', topic: 'tea', interests: ['travel'] }));
  assert.equal(status, 200); assert.equal(body.questions.length, 3); assert.equal(body.xp, 20); assert.ok(body.wordCount >= 100); assert.equal(body.glossary.length, 5);
  body.questions.forEach((question, index) => assert.equal(question.options[question.answerIndex], ['one', 'two', 'three'][index]));
  queue.push({ title: 'x', text: 'short', questions: [], glossary: [] }, { title: 'x', text: 'short', questions: [], glossary: [] });
  const invalidOutput = await call(routes.reading.POST, post('/api/english/reading', { level: 'A2' })); assert.equal(invalidOutput.status, 503); assert.equal(invalidOutput.body.code, 'invalid-output');
  assert.equal((await call(routes.reading.POST, post('/api/english/reading', { level: 'C1' }))).status, 400);
  assert.equal((await routes.reading.POST(post('/api/english/reading', { level: 'A2' }))).status, 401);
});

// ------------------------------------------------------------------ Qur'an and hadith sources
test('quran: references are validated against the real surah lengths and the 12-ayah cap', () => {
  assert.equal(quran.AYAH_COUNTS.length, 114); assert.equal(quran.AYAH_COUNTS.reduce((a, b) => a + b, 0), 6236);
  assert.deepEqual(quran.parseVerseRef('2:255'), { surah: 2, from: 255, to: 255 });
  assert.deepEqual(quran.parseVerseRef('112:1-4'), { surah: 112, from: 1, to: 4 });
  for (const bad of ['2:287', '0:1', '115:1', '2:0', '2:5-3', '2:1-14', '2', 'a:b', '2:255:1', '', null, undefined, 255, '2:1-']) assert.equal(quran.parseVerseRef(bad), null, String(bad));
  assert.deepEqual(quran.parseVerseRef('2:1-12'), { surah: 2, from: 1, to: 12 });
});

test('quran: the basmala that AlQuran Cloud prepends to ayah 1 is removed, except for Fatiha and At-Tawba', () => {
  const basmala = fixtures.surahs[112][0].ayahs[0].text.split(' ').slice(0, 4).join(' ');
  assert.equal(quran.withoutBasmala(fixtures.surahs[112][0].ayahs[0].text, 112, 1).startsWith(basmala), false);
  assert.equal(quran.withoutBasmala(fixtures.surahs[112][0].ayahs[1].text, 112, 2), fixtures.surahs[112][0].ayahs[1].text);
  const fatiha = fixtures.surahs[1][0].ayahs[0].text;
  assert.ok(fatiha.startsWith('﻿'), 'the fixture keeps the real byte order mark');
  assert.equal(quran.withoutBasmala(fatiha, 1, 1), fatiha.replace(/^﻿/, '').trim());
  assert.equal(quran.withoutBasmala('بَرَآءَةٌۭ مِّنَ ٱللَّهِ', 9, 1), 'بَرَآءَةٌۭ مِّنَ ٱللَّهِ');
});

test('quran: shared Diyanet meal spans are known (113:1-5, 110:1-3, 2:183-184) and an ayah with its own meal has none', () => {
  assert.deepEqual(quran.mealSpan(113, 3), { from: 1, to: 5 }); assert.deepEqual(quran.mealSpan(110, 1), { from: 1, to: 3 }); assert.deepEqual(quran.mealSpan(2, 184), { from: 183, to: 184 });
  assert.equal(quran.mealSpan(112, 1), null); assert.equal(quran.mealSpan(1, 2), null);
});

test('verse route: arabic, meal and transliteration come from the source; cache serves the second call; shared meal is grouped', async () => {
  const first = await call(routes.verse.GET, get('/api/islam/verse?ref=112:1-4'));
  assert.equal(first.status, 200); assert.equal(first.body.ref, '112:1-4'); assert.equal(first.body.surah.number, 112); assert.equal(first.body.ayahs.length, 4);
  assert.equal(first.body.ayahs[0].arabic.startsWith('قُلْ'), true, 'basmala removed from ayah 1'); assert.equal(first.body.ayahs[0].tr, 'De ki: O Allah bir tektir.');
  assert.equal(first.body.ayahs[0].words.length > 2, true); assert.equal(first.body.source.name, 'AlQuran Cloud'); assert.match(first.body.source.meal, /Diyanet/);
  assert.equal(calls.quran, 1); assert.equal(store.map.size, 4);
  const second = await call(routes.verse.GET, get('/api/islam/verse?ref=112:2-3'));
  assert.equal(second.status, 200); assert.equal(calls.quran, 1, 'served from KV'); assert.equal(second.body.ayahs[0].ayah, 2);
  const shared = await call(routes.verse.GET, get('/api/islam/verse?ref=113:1-5'));
  assert.equal(shared.body.ayahs.length, 5); assert.equal(shared.body.mealGroups.length, 1); assert.deepEqual(shared.body.mealGroups[0].ayahs, [1, 2, 3, 4, 5]); assert.deepEqual(shared.body.mealGroups[0].span, { from: 1, to: 5 });
  assert.ok(calls.urls.filter((url) => url.includes('alquran')).every((url) => url.startsWith('https://api.alquran.cloud/v1/')), 'only the fixed host is called');
});

test('verse route: bad references are 400, a source that is down is 502 source-unavailable, a source answering for the wrong ayah is refused', async () => {
  for (const ref of ['2:287', 'x', '2:1-14', '']) { const result = await call(routes.verse.GET, get(`/api/islam/verse?ref=${ref}`)); assert.equal(result.status, 400); assert.equal(result.body.code, 'invalid-request'); }
  assert.equal((await call(routes.verse.GET, get('/api/islam/verse'))).status, 400);
  sourceMode = 'down'; const down = await call(routes.verse.GET, get('/api/islam/verse?ref=112:1')); assert.equal(down.status, 502); assert.equal(down.body.code, 'source-unavailable');
  sourceMode = 'wrong-ayah'; const wrong = await call(routes.verse.GET, get('/api/islam/verse?ref=112:1')); assert.equal(wrong.status, 502); assert.equal(wrong.body.code, 'source-invalid'); assert.equal(store.map.size, 0, 'nothing invalid is cached');
  assert.equal((await routes.verse.GET(get('/api/islam/verse?ref=112:1'))).status, 401);
});

test('hadith route: Nevevi text and source tag come from the source; unknown numbers and wrong files are refused', async () => {
  const { status, body } = await call(routes.hadith.GET, get('/api/islam/hadith?ref=nawawi:3'));
  assert.equal(status, 200); assert.equal(body.number, 3); assert.equal(body.attribution, 'Buhari ve Müslim'); assert.match(body.tr, /beş esas/); assert.match(body.arabic, /[؀-ۿ]/);
  assert.equal(body.source.collection, 'nawawi'); assert.equal(calls.hadith, 2);
  await call(routes.hadith.GET, get('/api/islam/hadith?ref=nawawi:3')); assert.equal(calls.hadith, 2, 'cached');
  for (const ref of ['nawawi:0', 'nawawi:43', 'bukhari:1', 'nawawi:03', 'x']) assert.equal((await call(routes.hadith.GET, get(`/api/islam/hadith?ref=${ref}`))).status, 400, ref);
  store.map.clear(); sourceMode = 'wrong-number'; const wrong = await call(routes.hadith.GET, get('/api/islam/hadith?ref=nawawi:3')); assert.equal(wrong.status, 502); assert.equal(wrong.body.code, 'source-invalid');
  sourceMode = 'down'; assert.equal((await call(routes.hadith.GET, get('/api/islam/hadith?ref=nawawi:23'))).body.code, 'source-unavailable');
  assert.equal((await routes.hadith.GET(get('/api/islam/hadith?ref=nawawi:3'))).status, 401);
});

test('curriculum: every reference is valid, ids are unique, the 42 hadiths appear once and no ayah or hadith text is stored', async () => {
  const { status, body } = await call(routes.curriculum.GET, get('/api/islam/curriculum'));
  assert.equal(status, 200); assert.deepEqual(body.sections.map((section) => section.id), ['ibadet', 'kuran', 'ayet', 'hadis']); assert.match(body.notice, /yapay zekâ/);
  const lessons = body.sections.flatMap((section) => section.topics.flatMap((topic) => topic.lessons));
  assert.equal(new Set(lessons.map((lesson) => lesson.id)).size, lessons.length);
  for (const lesson of lessons) { assert.ok(curriculum.lessonRefsAreValid(lesson), lesson.id); assert.ok(lesson.verses.length + lesson.hadiths.length > 0, lesson.id); }
  const nawawi = body.sections[3].topics.flatMap((topic) => topic.lessons.flatMap((lesson) => lesson.hadiths)).sort();
  assert.deepEqual(nawawi, Array.from({ length: 42 }, (_, index) => `nawawi:${index + 1}`).sort());
  assert.equal(JSON.stringify(body).match(/[؀-ۿ]/g), null, 'no Arabic text in the curriculum');
  assert.ok(body.sections[0].topics.map((topic) => topic.id).includes('namaz') && body.sections[0].topics.length === 5);
  assert.equal((await routes.curriculum.GET(get('/api/islam/curriculum'))).status, 401);
});

// ------------------------------------------------------------------ AI explanation and quiz (grounded)
test('explain: the ayah/hadith text is fetched by the server and the AI part is labelled and grounded in it', async () => {
  queue.push({ summary: 'İhlâs sûresi Allah\'ın birliğini anlatır; O doğurmamış ve doğmamıştır.', points: ['Allah birdir.', 'Her şey O\'na muhtaçtır.', 'Hiçbir şey O\'na denk değildir.'], caution: '' });
  const { status, body } = await call(routes.explain.POST, post('/api/islam/explain', { lessonId: 'ihlas-anla' }));
  assert.equal(status, 200); assert.equal(body.aciklama.kind, 'ai-aciklama'); assert.match(body.aciklama.notice, /ayet ya da hadis değildir/i); assert.deepEqual(body.aciklama.basedOn, ['112:1-4']);
  assert.equal(body.verses[0].ayahs[0].tr, 'De ki: O Allah bir tektir.'); assert.equal(body.verses[0].ayahs.length, 4);
  const prompt = calls.lastModelBody.contents[0].parts[0].text;
  assert.match(prompt, /De ki: O Allah bir tektir/); assert.doesNotMatch(prompt, /[؀-ۿ]/, 'the model never receives Arabic text to copy or alter');
  assert.equal(JSON.stringify(body.aciklama).includes('quran-uthmani'), false);
});

test('explain: output with Arabic script, an unknown ayah number, an unknown hadith collection or an invented quote is rejected and never returned', async () => {
  const good = { summary: 'Allah birdir.', points: ['Allah birdir.', 'Her şey O\'na muhtaçtır.', 'Hiçbir şey O\'na denk değildir.'], caution: '' };
  const attacks = [
    { ...good, summary: 'Ayet şöyle: قُلْ هُوَ ٱللَّهُ أَحَدٌ' },
    { ...good, points: ['Bakara 2:255 ile birlikte okunur.', good.points[1], good.points[2]] },
    { ...good, points: ['Bu konuda Buhârî rivayeti vardır.', good.points[1], good.points[2]] },
    { ...good, summary: 'Allah "kullarına çok merhametlidir ve sonsuza dek bağışlar" buyurur.' },
    { ...good, points: ['bir', 'iki'] },
  ];
  for (const attack of attacks) {
    queue.length = 0; queue.push(attack, attack);
    const result = await call(routes.explain.POST, post('/api/islam/explain', { lessonId: 'ihlas-anla' }));
    assert.equal(result.status, 503, JSON.stringify(attack).slice(0, 60)); assert.equal(result.body.code, 'unverified-content'); assert.equal(Object.hasOwn(result.body, 'aciklama'), false);
  }
  queue.length = 0; queue.push({ ...good, summary: 'Sûrede "De ki: O Allah bir tektir." denir.' });
  assert.equal((await call(routes.explain.POST, post('/api/islam/explain', { lessonId: 'ihlas-anla' }))).status, 200, 'an exact quote from the supplied meal is fine');
  queue.length = 0; queue.push(attacks[1], good);
  assert.equal((await call(routes.explain.POST, post('/api/islam/explain', { lessonId: 'ihlas-anla' }))).status, 200, 'the second attempt is accepted');
});

test('explain and quiz: unknown lesson, bad body, wrong method data and missing session are refused', async () => {
  for (const handler of [routes.explain.POST, routes.quiz.POST]) {
    for (const body of [{ lessonId: 'yok' }, {}, { lessonId: 5 }, { lessonId: '__proto__' }, '[]']) { const result = await call(handler, post('/api/islam/x', body)); assert.equal(result.status, 400); assert.equal(result.body.code, 'invalid-request'); }
    assert.equal((await handler(post('/api/islam/x', { lessonId: 'ihlas-anla' }))).status, 401);
    const forged = await call(handler, post('/api/islam/x', { lessonId: 'ihlas-anla' }, { Origin: 'https://evil.test' })); assert.equal(forged.status, 403);
  }
  globalThis.__learnEnv = { DB: db, MEDIA: store };
  assert.equal((await call(routes.explain.POST, post('/api/islam/explain', { lessonId: 'ihlas-anla' }))).body.code, 'not_configured');
  assert.equal(calls.quran, 0, 'configuration is checked before any source is called');
});

test('quiz: 4 questions based on the lesson texts, each naming its ayah/hadith basis; a basis outside the lesson is rejected', async () => {
  const question = (basis, extra = {}) => ({ prompt: 'Sûreye göre Allah nasıldır?', options: ['Bir tektir', 'İki tanedir', 'Doğurmuştur'], answerIndex: 0, basis, explanation: 'İlk ayette bildirilir.', ...extra });
  queue.push({ questions: [question('112:1'), question('112:2'), question('112:3'), question('112:4')] });
  const { status, body } = await call(routes.quiz.POST, post('/api/islam/quiz', { lessonId: 'ihlas-anla' }));
  assert.equal(status, 200); assert.equal(body.kind, 'ai-quiz'); assert.equal(body.questions.length, 4);
  for (const q of body.questions) { assert.equal(q.options[q.answerIndex], 'Bir tektir'); assert.match(q.basis, /^112:[1-4]$/); assert.match(q.id, /^q-/); }
  queue.length = 0; queue.push({ questions: [question('2:255'), question('112:2'), question('112:3'), question('112:4')] }, { questions: [question('112:1'), question('112:2'), question('112:3')] });
  const bad = await call(routes.quiz.POST, post('/api/islam/quiz', { lessonId: 'ihlas-anla' }));
  assert.equal(bad.status, 503); assert.equal(bad.body.code, 'unverified-content');
  queue.length = 0; queue.push({ questions: [question('112:1', { options: ['A', 'A', 'B'] }), question('112:2'), question('112:3'), question('112:4')] }, { questions: [question('112:1', { prompt: 'Arapça: قُلْ' }), question('112:2'), question('112:3'), question('112:4')] });
  assert.equal((await call(routes.quiz.POST, post('/api/islam/quiz', { lessonId: 'ihlas-anla' }))).status, 503);
});

test('quiz: a hadith lesson uses the hadith as basis and its attribution stays visible to the model', async () => {
  const q = (basis) => ({ prompt: 'Hadise göre ameller neye göredir?', options: ['Niyetlere', 'Zamana', 'Mala'], answerIndex: 0, basis, explanation: 'Hadis niyeti öne çıkarır.' });
  queue.push({ questions: [q('nawawi:3'), q('nawawi:3'), q('nawawi:3'), q('nawawi:3')] });
  const ok = await call(routes.quiz.POST, post('/api/islam/quiz', { lessonId: 'hadis-3' }));
  assert.equal(ok.status, 200);
  assert.match(calls.lastModelBody.contents[0].parts[0].text, /Buhari ve Müslim/);
});
