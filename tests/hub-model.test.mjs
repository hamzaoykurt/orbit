import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const hub = await import(loadModuleUrl(new URL('../app/hub/hub-model.ts', import.meta.url)));

test('Hub migration keeps valid links and bounds unsafe collection fields', () => {
  const links = hub.normalizeHubLinks([
    null,
    { id: 'broken', url: 'https://example.com' },
    {
      id: 'one', url: 'https://example.com', title: 'Example', platform: 'unknown',
      summary: 'A summary', mainCategory: 'Araçlar', addedBy: 'Orbit', createdAt: '2026-09-14T00:00:00.000Z',
      categories: [...Array.from({ length: 20 }, (_, index) => `tag-${index}`), 42],
      embedded: [{ url: 'https://inside.example', platform: 'web', title: 'Inside', summary: 'Nested' }, { title: 'bad' }],
      images: Array.from({ length: 20 }, (_, index) => `https://img.example/${index}.jpg`),
    },
  ]);
  assert.equal(links.length, 1);
  assert.equal(links[0].platform, 'web');
  assert.equal(links[0].categories.length, 8);
  assert.equal(links[0].embedded.length, 1);
  assert.equal(links[0].images.length, 8);
});

test('workflow carries every product phase and the full infrastructure map', () => {
  assert.deepEqual(hub.workflowPhases.map(phase => phase.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(hub.workflowInfrastructure.length >= 12);
  assert.ok(hub.workflowInfrastructure.some(item => item.id === 'stacks'));
  assert.ok(hub.workflowInfrastructure.some(item => item.id === 'skills'));
  assert.ok(hub.hubPromptRecipes.length >= 6);
  assert.ok(hub.hubResources.length >= 6);
});
