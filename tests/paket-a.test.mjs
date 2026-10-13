import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';
const { createCoalescedWriter } = await import(loadModuleUrl(new URL('../app/coalesced-writer.ts', import.meta.url)));
const { createDraftCommitter } = await import(loadModuleUrl(new URL('../app/draft-commit.ts', import.meta.url)));
const { readBootSnapshot, reconcileServer } = await import(loadModuleUrl(new URL('../app/boot-state.ts', import.meta.url)));
const { journalState, acknowledgeState, STATE_KEY, PENDING_KEY } = await import(loadModuleUrl(new URL('../app/state-sync.ts', import.meta.url)));

function clock() {
  let now = 0; let nextId = 1; const timers = new Map();
  return {
    timers: { set: (callback, ms) => { const id = nextId++; timers.set(id, { at: now + ms, callback }); return id; }, clear: id => timers.delete(id), now: () => now },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].callback();
      }
      now = end;
    },
  };
}
const memory = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: k => k in data ? data[k] : null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
};

test('a typing burst serializes rarely, not once per keystroke', () => {
  const c = clock(); let runs = 0;
  const writer = createCoalescedWriter({ delay: 300, maxWait: 1200, run: () => ++runs, timers: c.timers });
  for (let i = 0; i < 20; i++) { writer.schedule(); c.advance(100); }
  assert.ok(runs <= 2, `runs=${runs}`);
  c.advance(400);
  assert.ok(runs >= 1 && runs <= 3);
  const before = runs; c.advance(5000); assert.equal(runs, before);
});

test('continuous editing still writes within maxWait and flush is synchronous', () => {
  const c = clock(); let runs = 0;
  const writer = createCoalescedWriter({ delay: 300, maxWait: 1200, run: () => ++runs, timers: c.timers });
  for (let i = 0; i < 30; i++) { writer.schedule(); c.advance(200); }
  assert.ok(runs >= 4, `runs=${runs}`);
  writer.schedule(); const before = runs;
  assert.equal(writer.flush(), before + 1);
  assert.equal(writer.flush(), before + 1);
});

test('the localStorage journal keeps pending edits after the debounced write', () => {
  const storage = memory(); const c = clock(); let state = '{"n":1}'; const base = '{"n":0}';
  const writer = createCoalescedWriter({ delay: 300, maxWait: 1200, run: () => { journalState(storage, state, base); return state; }, timers: c.timers });
  writer.schedule(); assert.equal(storage.getItem(PENDING_KEY), null);
  state = '{"n":2}'; writer.schedule(); writer.flush();
  assert.equal(JSON.parse(storage.getItem(PENDING_KEY)).state, '{"n":2}');
  assert.equal(storage.getItem(STATE_KEY), '{"n":2}');
  acknowledgeState(storage, '{"n":2}'); assert.equal(storage.getItem(PENDING_KEY), null);
});

test('draft commits once per pause, on flush, and never after discard', () => {
  const c = clock(); const commits = [];
  const draft = createDraftCommitter(patch => commits.push(patch), 300, c.timers);
  draft.set({ title: 'a' }); c.advance(100); draft.set({ title: 'ab' }); draft.set({ body: 'x' }); c.advance(299);
  assert.equal(commits.length, 0);
  c.advance(1); assert.deepEqual(commits, [{ title: 'ab', body: 'x' }]);
  draft.set({ title: 'z' }); draft.flush(); assert.deepEqual(commits[1], { title: 'z' });
  draft.set({ title: 'gone' }); draft.discard(); c.advance(1000); draft.flush(); assert.equal(commits.length, 2);
});

test('continuous typing still commits to the workspace at least every maxWait', () => {
  const c = clock(); const commits = [];
  const draft = createDraftCommitter(patch => commits.push(patch), 300, c.timers, 1000);
  for (let i = 0; i < 40; i++) { draft.set({ body: 'x'.repeat(i + 1) }); c.advance(100); }
  assert.ok(commits.length >= 3, `commits=${commits.length}`);
});

test('boot paints from the device copy and replays pending edits over the server state', () => {
  const server = { a: 'server-new', b: 'b0', list: [{ id: '1', t: 'one' }, { id: '2', t: 'two-server' }] };
  const acknowledged = { a: 'a0', b: 'b0', list: [{ id: '1', t: 'one' }] };
  const edited = { a: 'a0', b: 'b-local', list: [{ id: '1', t: 'one' }, { id: '3', t: 'three-local' }] };
  const storage = memory();
  journalState(storage, JSON.stringify(edited), JSON.stringify(acknowledged));
  const snapshot = readBootSnapshot(storage);
  assert.equal(snapshot.pending, true);
  assert.deepEqual(snapshot.state, edited);
  const merged = reconcileServer(snapshot.base, snapshot.state, server);
  assert.equal(merged.a, 'server-new');
  assert.equal(merged.b, 'b-local');
  assert.deepEqual(merged.list.map(i => i.id).sort(), ['1', '2', '3']);
});

test('without pending edits the server wins; edits typed while waiting survive', () => {
  const cached = { a: 'a0', b: 'b0' }; const server = { a: 'a1', b: 'b1' };
  const storage = memory({ [STATE_KEY]: JSON.stringify(cached) });
  const snapshot = readBootSnapshot(storage);
  assert.equal(snapshot.pending, false);
  assert.deepEqual(reconcileServer(snapshot.base, snapshot.state, server), server);
  const typedMeanwhile = { a: 'a0', b: 'typed' };
  assert.deepEqual(reconcileServer(snapshot.base, typedMeanwhile, server), { a: 'a1', b: 'typed' });
});

test('empty or corrupt device storage yields no snapshot, so a first visit waits for the server', () => {
  assert.equal(readBootSnapshot(memory()), null);
  assert.equal(readBootSnapshot(memory({ [STATE_KEY]: '{broken' })), null);
});
