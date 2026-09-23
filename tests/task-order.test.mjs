import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { insertIndexedRecord, newestCustomFirst, withoutRecordKey } = await import(loadModuleUrl(new URL('../app/task-order.ts', import.meta.url)));

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

test('inserting a newest task shifts only matching index-based state', () => {
  const state = { 'dept-sales-0': true, 'dept-sales-2': false, 'dept-other-0': true, note: 'keep' };
  assert.deepEqual(insertIndexedRecord(state, 'dept-sales-'), {
    'dept-sales-1': true,
    'dept-sales-3': false,
    'dept-other-0': true,
    note: 'keep',
  });
  assert.deepEqual(state, { 'dept-sales-0': true, 'dept-sales-2': false, 'dept-other-0': true, note: 'keep' });
});

test('a newly allocated task id is explicitly reopened without touching other state', () => {
  assert.deepEqual(withoutRecordKey({ stale: true, keep: true }, 'stale'), { keep: true });
});
