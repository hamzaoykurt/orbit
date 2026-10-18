import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { cleanHubNote, clampHubNotes, normalizeHubLinks, buildReanalysisPatch, hubSearchText, HUB_NOTE_MAX } = await import(loadModuleUrl(new URL('../app/hub/hub-model.ts', import.meta.url)));

const base = { id: '1', url: 'https://a.example/', title: 'Örnek', platform: 'web', summary: 'Özet', purpose: 'Amaç', mainCategory: 'Araçlar', categories: ['x'], images: [], embedded: [], addedBy: 'Orbit', createdAt: '2026-10-01T00:00:00.000Z' };

test('note cleaning: text only, trimmed, line breaks kept, capped, empty means none', () => {
  assert.equal(cleanHubNote('  merhaba\r\nDünya  '), 'merhaba\nDünya');
  assert.equal(cleanHubNote('   \n  '), undefined);
  assert.equal(cleanHubNote(''), undefined);
  for (const bad of [null, undefined, 5, {}, ['a']]) assert.equal(cleanHubNote(bad), undefined);
  assert.equal(cleanHubNote('a\u0000b'), 'ab');
  const long = cleanHubNote('ö'.repeat(5000));
  assert.equal(long.length, HUB_NOTE_MAX); assert.equal(HUB_NOTE_MAX, 2000);
});

test('stored links: note is kept, trimmed and capped; old links stay valid', () => {
  const [withNote, old, junk, huge] = normalizeHubLinks([{ ...base, note: ' Sonra bak ' }, base, { ...base, id: '3', note: 42 }, { ...base, id: '4', note: 'x'.repeat(9000) }]);
  assert.equal(withNote.note, 'Sonra bak');
  assert.equal('note' in old, false); assert.equal('note' in junk, false);
  assert.equal(huge.note.length, 2000);
});

test('/api/state guard clamps notes without touching anything else', () => {
  const state = { other: { keep: true }, hubLinks: [{ ...base, note: 'y'.repeat(9000) }, { ...base, id: '2', note: 7 }, { ...base, id: '3', note: '   ' }, { ...base, id: '4' }, null] };
  const out = clampHubNotes(state);
  assert.equal(out.hubLinks[0].note.length, 2000);
  for (const index of [1, 2]) assert.equal('note' in out.hubLinks[index], false);
  assert.equal('note' in out.hubLinks[3], false); assert.equal(out.hubLinks[4], null);
  assert.deepEqual(out.other, { keep: true });
  assert.equal(state.hubLinks[0].note.length, 9000, 'input is not mutated');
  assert.equal(clampHubNotes(null), null); assert.deepEqual(clampHubNotes({ a: 1 }), { a: 1 });
});

test('Hub search finds links by their note', () => {
  const link = { ...base, note: 'Kuzenime gönder: Çiğdem bayılır' };
  assert.ok(hubSearchText(link).includes('çiğdem'.toLocaleLowerCase('tr')));
  assert.ok(!hubSearchText(base).includes('kuzenime'));
});

test('re-analysis never touches the note, title or category', () => {
  const link = { ...base, note: 'Benim notum', title: 'Elle düzenlendi', mainCategory: 'Tasarım' };
  const { patch } = buildReanalysisPatch(link, { summary: 'Yeni özet', purpose: 'Yeni amaç', title: 'Başka', mainCategory: 'Diğer', note: 'ezmeye çalış', images: ['https://i.example/a.png'] });
  assert.equal(patch.summary, 'Yeni özet'); assert.equal(patch.purpose, 'Yeni amaç');
  for (const key of ['note', 'title', 'mainCategory', 'categories']) assert.equal(key in patch, false, key);
  assert.deepEqual({ ...link, ...patch }.note, 'Benim notum');
  const worse = buildReanalysisPatch(link, { summary: 'x', estimated: true });
  assert.equal(worse.patch, undefined); assert.match(worse.message, /korundu/);
});
