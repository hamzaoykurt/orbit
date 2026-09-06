import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const protocol = await import(loadModuleUrl(new URL('../integrations/profitness/protocol.ts', import.meta.url)));
const summary = {
  weekStartsOn: '2026-08-31', timeZone: 'Europe/Istanbul', weeklyTarget: 3, completedThisWeek: 2,
  today: { name: 'Full body', status: 'completed' },
  lastCompleted: { name: 'Full body', completedAt: '2026-09-06T08:30:00.000Z' },
  schedule: [{ dayIndex: 0, name: 'Full body', isRestDay: false }],
};
const envelope = { orbitAccountId: 'orbit-account', fitnessUserId: 'fd0f4fcb-93d9-4c7d-b5fb-0bd478c9b778', summary };

test('premium capability is exact and server-owned', () => {
  assert.equal(protocol.hasFitnessSyncCapability('notes,fitness_sync,calendar'), true);
  assert.equal(protocol.hasFitnessSyncCapability('fitness_sync_trial'), false);
  assert.equal(protocol.hasFitnessSyncCapability(undefined), false);
});

test('link state accepts only bounded two-part base64url values', () => {
  assert.equal(protocol.validLinkState('abc_DEF.123-xyz'), true);
  assert.equal(protocol.validLinkState('https://attacker.example'), false);
  assert.equal(protocol.validLinkState(`${'a'.repeat(4096)}.x`), false);
});

test('sync envelope keeps only the minimal validated summary', () => {
  assert.deepEqual(protocol.parseFitnessSyncEnvelope(envelope), envelope);
  assert.equal(protocol.parseFitnessSyncEnvelope({ ...envelope, fitnessUserId: 'not-a-user' }), null);
  assert.equal(protocol.parseFitnessSyncEnvelope({ ...envelope, summary: { ...summary, completedThisWeek: -1 } }), null);
  assert.equal(protocol.parseFitnessSyncEnvelope({ ...envelope, summary: { ...summary, today: { name: 'x', status: 'forged' } } }), null);
});

test('bearer parsing rejects short, malformed and ambiguous credentials', () => {
  assert.equal(protocol.bearerToken('Bearer 1234567890123456'), '1234567890123456');
  assert.equal(protocol.bearerToken('bearer 1234567890123456'), null);
  assert.equal(protocol.bearerToken('Bearer short'), null);
  assert.equal(protocol.bearerToken('Bearer one two'), null);
});
