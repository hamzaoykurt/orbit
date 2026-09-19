import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { newestCustomFirst } = await import(loadModuleUrl(new URL('../app/task-order.ts', import.meta.url)));

test('newly saved tasks are shown before older custom and default tasks', () => {
  assert.deepEqual(newestCustomFirst(['default-a', 'default-b'], ['older', 'newest']), ['newest', 'older', 'default-a', 'default-b']);
});

test('ordering does not mutate persisted task arrays', () => {
  const defaults = ['default'];
  const customs = ['older', 'newest'];
  newestCustomFirst(defaults, customs);
  assert.deepEqual(defaults, ['default']);
  assert.deepEqual(customs, ['older', 'newest']);
});
