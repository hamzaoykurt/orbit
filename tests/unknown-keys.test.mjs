import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// A web save must never erase fields written by another client (the native app, a newer build): unknown top-level
// keys and unknown fields inside known objects survive normalisation, the 409 rebase path and the server round trip.
const cache = new Map();
const load = (file) => {
  if (cache.has(file.href)) return cache.get(file.href);
  let code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace("import { env } from 'cloudflare:workers';", 'const env = new Proxy({}, { get: (_, key) => globalThis.__stateEnv[key] });');
  code = code.replace(/from (['"])(\.[^'"]+)\1/g, (_, quote, path) => `from ${JSON.stringify(load(new URL(`${path}.ts`, file)))}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  cache.set(file.href, url);
  return url;
};
const mod = (path) => import(load(new URL(path, import.meta.url)));
globalThis.__stateEnv = {};
const { carryExtras } = await mod('../app/preserve-extras.ts');
const { normalizeHubLinks } = await mod('../app/hub/hub-model.ts');
const { normalizeNotes } = await mod('../app/notes/note-model.ts');
const { normalizeProgram } = await mod('../app/program/program-model.ts');
const { normalizeCreationDraft } = await mod('../app/projects/planning-types.ts');
const { normalizeWorkspace } = await mod('../app/projects/project-types.ts');
const { normalizeJourney } = await mod('../app/rebuild/journey-model.ts');
const { normalizeDeck } = await mod('../app/rebuild/weekly-deck-model.ts');
const { normalizePractice } = await mod('../app/rebuild/practice-model.ts');
const { rebaseState } = await mod('../app/state-sync.ts');
const { authenticatedRequest } = await mod('../auth/context.ts');
const stateRoute = await mod('../app/api/state/route.ts');

test('carryExtras copies unknown JSON fields only, never prototype keys, dropped-on-purpose keys or what the normalizer produced', () => {
  const source = JSON.parse('{"id":"a","known":"bad","later":true,"list":[1,{"x":2}],"nested":{"k":1},"__proto__":{"polluted":true},"constructor":1}');
  const out = carryExtras(source, { id: 'a' }, ['id', 'known']);
  assert.deepEqual(out, { id: 'a', later: true, list: [1, { x: 2 }], nested: { k: 1 } });
  assert.equal(Object.hasOwn(out, 'known'), false, 'a key the normalizer reads and dropped stays dropped');
  assert.equal({}.polluted, undefined); assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.deepEqual(carryExtras({ id: 'b', extra: 1 }, { id: 'normalized', extra: 'own' }, ['id']), { id: 'normalized', extra: 'own' }, 'the normalizer output wins');
  assert.equal(carryExtras(null, { a: 1 }, []).a, 1); assert.deepEqual(carryExtras([1], { a: 1 }, []), { a: 1 });
});

test('hub links and notes keep new fields; an invalid note stays dropped', () => {
  const [link] = normalizeHubLinks([{ id: 'h1', url: 'https://a.test', title: 'T', later: true, tags2: ['x'], note: 42 }]);
  assert.equal(link.later, true); assert.deepEqual(link.tags2, ['x']); assert.equal(Object.hasOwn(link, 'note'), false);
  const [note] = normalizeNotes([{ id: 'n1', title: 'T', pinned: true, reminder: { at: 'x' } }]);
  assert.equal(note.pinned, true); assert.deepEqual(note.reminder, { at: 'x' });
});

test('program keeps new fields at every level (root, template, block, step, week log, profile)', () => {
  const week = '2026-11-02';
  const program = normalizeProgram({ version: 1, rootNew: 1, profile: { bankedXp: 3, badges: {}, bestStreak: 1, levelNew: 5 },
    template: { tplNew: 1, bonus: {}, week: {}, blocks: [{ id: 'b1', name: 'B', slot: 'am', blockNew: 2, steps: [{ id: 's1', t: '06:00', text: 'Do it', stepNew: 3 }] }] },
    weeks: { [week]: { done: { '0:s1': '2026-11-02T06:00' }, moved: {}, days: {}, breaks: {}, logNew: [1] } } });
  assert.equal(program.rootNew, 1); assert.equal(program.profile.levelNew, 5); assert.equal(program.profile.bankedXp, 3);
  assert.equal(program.template.tplNew, 1); assert.equal(program.template.blocks[0].blockNew, 2); assert.equal(program.template.blocks[0].steps[0].stepNew, 3);
  assert.deepEqual(program.weeks[week].logNew, [1]); assert.deepEqual(program.weeks[week].done, { '0:s1': '2026-11-02T06:00' });
});

test('project creation draft and workspace notes keep new fields', () => {
  assert.equal(normalizeCreationDraft({ id: 'd1', brandNew: { a: 1 } }).brandNew.a, 1);
  const workspace = normalizeWorkspace({ rootNew: 1, notes: [{ id: 'n', title: 't', color: 'red', links: [{ id: 'l', title: 'x', url: 'https://a.test', flag: true }] }], mentor: { source: 'mentor', importedAt: 'x', mentorNew: 1 } });
  assert.equal(workspace.rootNew, 1); assert.equal(workspace.notes[0].color, 'red'); assert.equal(workspace.notes[0].links[0].flag, true); assert.equal(workspace.mentor.mentorNew, 1);
});

test('journey, weekly deck and practice keep new fields at every level', () => {
  const journey = normalizeJourney({ startDate: '2026-01-05', journeyNew: { a: 1 }, experiments: [{ id: 'e', name: 'n', expNew: 1 }] });
  assert.deepEqual(journey.journeyNew, { a: 1 }); assert.equal(journey.experiments[0].expNew, 1);
  const deck = normalizeDeck({ startedOn: '2026-01-05', deckNew: 1, defaults: [{ id: 'body', name: 'Spor', target: 3, kind: 'body', goalNew: 1 }],
    weeks: { '2026-01-05': { weekNew: 1, goals: [], ideas: {}, marks: { body: [{ id: 'm1', at: '2026-01-05T10:00', markNew: 1 }] } } } });
  assert.equal(deck.deckNew, 1); assert.equal(deck.defaults[0].goalNew, 1); assert.equal(deck.weeks['2026-01-05'].weekNew, 1); assert.equal(deck.weeks['2026-01-05'].marks.body[0].markNew, 1);
  const practice = normalizePractice({ learnNew: { a: [1] },
    words: [{ id: 'w1', word: 'a', meaning: 'b', addedAt: '2026-01-01T00:00:00Z', dueAt: '2026-01-02T00:00:00Z', wordNew: 1 }],
    research: [{ id: 'r1', title: 'T', question: 'Q', resNew: 1, questions: [{ id: 'q1', text: 'x', qNew: 1 }], synthesis: { explanation: 'e', synNew: 1 },
      sources: [{ id: 's', title: 't', url: 'https://a.test', srcNew: 1 }], images: [{ id: 'i', url: 'https://a.test/i.png', imgNew: 1 }],
      quiz: { id: 'z', quizNew: 1, questions: [{ id: 'k', prompt: 'p', angle: 'why', kNew: 1 }] } }],
    sessions: [{ id: 's1', at: '2026-01-01T00:00:00Z', seconds: 5, prompt: 'p', words: [], sesNew: 1 }], speakingPrompt: { id: 'p', text: 't', promptNew: 1 }, lastMeal: { id: 'm', text: 't', mealNew: 1 } });
  assert.deepEqual(practice.learnNew, { a: [1] }); assert.equal(practice.words[0].wordNew, 1);
  const topic = practice.research[0];
  assert.deepEqual([topic.resNew, topic.questions[0].qNew, topic.synthesis.synNew, topic.sources[0].srcNew, topic.images[0].imgNew, topic.quiz.quizNew, topic.quiz.questions[0].kNew], [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual([practice.sessions[0].sesNew, practice.speakingPrompt.promptNew, practice.lastMeal.mealNew], [1, 1, 1]);
  assert.equal(practice.version, 1, 'known fields are still normalised');
});

test('rebase keeps keys that exist on only one side (the 409 and boot merge path)', () => {
  const base = { a: 1 }, local = { a: 1, nativeKey: { n: 1 } }, remote = { a: 2, otherDeviceKey: [1] };
  assert.deepEqual(rebaseState(base, local, remote), { a: 2, nativeKey: { n: 1 }, otherDeviceKey: [1] });
  assert.deepEqual(rebaseState(undefined, { x: 1, learnProgress: { v: 1 } }, { y: 2 }), { x: 1, learnProgress: { v: 1 }, y: 2 });
});

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE orbit_state (workspace_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) STRICT');
  return { prepare(sql) { let args = []; return { bind(...values) { args = values; return this; }, async first() { return sqlite.prepare(sql).get(...args) || null; } }; } };
}
test('server: PUT /api/state stores and GET returns unknown keys; a stale PUT answers 409 with the stored state including them', async () => {
  globalThis.__stateEnv = { DB: database() };
  const put = (body) => authenticatedRequest.run({ username: 'owner' }, () => stateRoute.PUT(new Request('https://orbit.test/api/state', { method: 'PUT', headers: { Origin: 'https://orbit.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
  const state = { completed: {}, learnProgress: { version: 1, english: { xp: 40 } }, subscriptions: [{ id: 's', plan: 'x' }], hubLinks: [{ id: 'h', url: 'https://a.test', title: 'T', later: true }], personalItemDetails: { x: { later: true, list: [1] } } };
  assert.equal((await put({ state, revision: 0 })).status, 200);
  const read = await authenticatedRequest.run({ username: 'owner' }, () => stateRoute.GET(new Request('https://orbit.test/api/state')));
  const stored = await read.json();
  assert.deepEqual(stored.state.learnProgress, state.learnProgress); assert.deepEqual(stored.state.subscriptions, state.subscriptions);
  assert.equal(stored.state.hubLinks[0].later, true); assert.deepEqual(stored.state.personalItemDetails.x, { later: true, list: [1] });
  const stale = await put({ state: { completed: { a: true } }, revision: 0 });
  assert.equal(stale.status, 409); assert.deepEqual((await stale.json()).state.learnProgress, state.learnProgress);
});

test('web: the persisted-state merge carries unknown top-level keys (guard against removing the call)', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /return carryExtras\(saved, \{/);
  assert.match(page, /\}, Object\.keys\(defaultState\)\) as PersistedState;/);
});

test('web: editing a personal item merges into the stored details, so fields like bucket survive (guard)', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /\[editingPersonalItemId\]: \{ \.\.\.current\.personalItemDetails\[editingPersonalItemId\], \.\.\.details \}/);
  assert.match(page, /settings: \{ \.\.\.defaultState\.settings, \.\.\.savedSettings,/, 'settings keep unknown fields such as subscriptions');
  assert.match(page, /personalItemDetails: \{ \.\.\.defaultState\.personalItemDetails, \.\.\.\(saved\.personalItemDetails \?\? \{\}\) \}/);
});
