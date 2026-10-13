import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';
const { greeting, weekGoalRows, weekXp, activeStreak } = await import(loadModuleUrl(new URL('../app/home-today.ts', import.meta.url)));

test('greeting follows the hour and uses only the first name', () => {
  assert.equal(greeting(new Date(2026, 9, 13, 7), 'Hamza Oykurt'), 'Günaydın, Hamza');
  assert.equal(greeting(new Date(2026, 9, 13, 13)), 'Merhaba');
  assert.equal(greeting(new Date(2026, 9, 13, 19), ' '), 'İyi akşamlar');
  assert.equal(greeting(new Date(2026, 9, 13, 2), 'Ali'), 'İyi geceler, Ali');
});
test('goal rows cap progress at the target and xp counts completed steps', () => {
  const week = { goals: [{ id: 'a', name: 'Spor', target: 3, kind: 'body' }, { id: 'b', name: 'English', target: 1, kind: 'english' }], marks: { a: [{ id: '1', at: '' }, { id: '2', at: '' }], b: [{ id: '3', at: '' }, { id: '4', at: '' }] }, ideas: {} };
  const rows = weekGoalRows(week);
  assert.deepEqual(rows.map(r => [r.done, r.complete]), [[2, false], [1, true]]);
  assert.equal(weekXp(rows), 30);
  assert.deepEqual(weekGoalRows(undefined), []);
});
test('streak counts back from today, or from yesterday when today is still empty', () => {
  const at = (d, h = 10) => new Date(2026, 9, d, h).toISOString();
  const deck = { weeks: { w: { goals: [], ideas: {}, marks: { a: [{ id: '1', at: at(11) }, { id: '2', at: at(12) }, { id: '3', at: at(13) }, { id: '4', at: at(9) }] } } } };
  assert.equal(activeStreak(deck, new Date(2026, 9, 13, 20)), 3);
  assert.equal(activeStreak(deck, new Date(2026, 9, 14, 8)), 3);
  assert.equal(activeStreak(deck, new Date(2026, 9, 16, 8)), 0);
});
