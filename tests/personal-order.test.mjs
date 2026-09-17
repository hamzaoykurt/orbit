import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { putPersonalItemFirst } = await import(loadModuleUrl(new URL('../app/personal-order.ts', import.meta.url)));

test('a newly added personal item is placed above the current manual order', () => {
  assert.deepEqual(putPersonalItemFirst(['task-b', 'task-a', 'task-c'], 'task-new'), ['task-new', 'task-b', 'task-a', 'task-c']);
});

test('placing an existing personal item first never duplicates it', () => {
  assert.deepEqual(putPersonalItemFirst(['task-a', 'task-b', 'task-c'], 'task-b'), ['task-b', 'task-a', 'task-c']);
});
