import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(path, replacements = []) {
  let source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of replacements) source = source.replace(from, to);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const model = await import(moduleUrl('../app/projects/project-types.ts'));
const validationUrl = moduleUrl('../app/api/project-media/media-validation.ts');
const validation = await import(validationUrl);

test('legacy and nested subtasks preserve all completion identities', () => {
  const result = model.buildProjectTasks('orbit', ['Research', '> Read paper', 'Prototype'], { 'orbit:0': [{ id: 'sub-1', title: 'Find sources' }] });
  assert.equal(result.length, 2);
  assert.equal(result[1].index, 2);
  assert.equal(result[1].id, 'project-orbit-2');
  assert.deepEqual(result[0].children.map(child => child.id), ['sub-1', 'project-orbit-1']);
  assert.equal(result[0].children[1].legacy, true);
});
test('removing a project task also removes its children and safely compacts related state', () => {
  const state = model.removeProjectTaskState('orbit', ['First', '> Legacy child', 'Second', 'Third'], [], 0, {
    removedTasks: [],
    completed: { 'project-orbit-0': true, 'project-orbit-1': true, 'project-orbit-2': true, 'child-1': true, unrelated: true },
    subtasks: { 'orbit:0': [{ id: 'child-1', title: 'Nested child' }], 'orbit:2': [{ id: 'child-2', title: 'Keep me' }], 'other:0': [{ id: 'other-child', title: 'Other project' }] },
    details: { 'project-orbit-0': { note: 'delete', photos: [] }, 'project-orbit-2': { note: 'keep', photos: [] } },
  });
  assert.deepEqual(model.visibleProjectTaskTitles(['First', '> Legacy child', 'Second', 'Third'], [], state.removedTasks), ['Second', 'Third']);
  assert.deepEqual(state.completed, { 'project-orbit-0': true, unrelated: true });
  assert.deepEqual(state.subtasks['orbit:0'], [{ id: 'child-2', title: 'Keep me' }]);
  assert.deepEqual(state.subtasks['other:0'], [{ id: 'other-child', title: 'Other project' }]);
  assert.equal(state.details['project-orbit-0'].note, 'keep');
});
test('task removal keys distinguish duplicate titles', () => {
  const state = model.removeProjectTaskState('p', ['Repeat', 'Repeat'], [], 0, { removedTasks: [], completed: {}, subtasks: {}, details: {} });
  assert.deepEqual(model.visibleProjectTaskTitles(['Repeat', 'Repeat'], [], state.removedTasks), ['Repeat']);
});
test('standalone legacy child remains accessible', () => {
  assert.equal(model.buildProjectTasks('x', ['> Legacy'], {})[0].title, 'Legacy');
});
test('resource links reject scripts and credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'https://a:b@example.com', 'not a url']) assert.equal(model.safeResourceUrl(url), null);
  assert.equal(model.safeResourceUrl('https://example.com/design'), 'https://example.com/design');
});
const diagram = { id: 'd', title: 'Flow', nodes: [{ id: 'a', x: 20, y: 20, color: 'violet', label: 'A' }, { id: 'b', x: 300, y: 20, color: 'blue', label: 'B' }], edges: [] };
test('dragging clamps nodes without mutating the previous document', () => {
  const moved = model.moveDiagramNode(diagram, 'a', -500, 2000);
  assert.equal(moved.nodes[0].x, 0); assert.equal(moved.nodes[0].y, 520); assert.equal(diagram.nodes[0].x, 20);
});
test('connections reject duplicates, missing targets and self loops', () => {
  const linked = model.connectDiagramNodes(diagram, 'a', 'b', 'edge');
  assert.equal(linked.edges.length, 1);
  assert.equal(model.connectDiagramNodes(linked, 'a', 'b', 'duplicate').edges.length, 1);
  assert.equal(model.connectDiagramNodes(diagram, 'a', 'a', 'self').edges.length, 0);
  assert.equal(model.connectDiagramNodes(diagram, 'a', 'missing', 'bad').edges.length, 0);
  const removed = model.removeDiagramNode(linked, 'a');
  assert.equal(removed.nodes.length, 1); assert.equal(removed.edges.length, 0);
});
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
test('image validation checks actual bytes and rejects SVG/HTML', () => {
  assert.equal(validation.imageContentType(png), 'image/png');
  assert.equal(validation.imageContentType(new TextEncoder().encode('<svg xmlns="test"></svg>')), null);
  assert.equal(validation.imageContentType(new Uint8Array([255, 216])), null);
});
test('upload reader limits declared and streamed sizes', async () => {
  await assert.rejects(() => validation.readLimitedImage(new Request('https://example.com', { method: 'POST', headers: { 'content-length': String(validation.MAX_IMAGE_BYTES + 1) }, body: 'test' })), /too-large/);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(validation.MAX_IMAGE_BYTES + 1)); controller.close(); } });
  await assert.rejects(() => validation.readLimitedImage(new Request('https://example.com', { method: 'POST', body: stream, duplex: 'half' })), /too-large/);
  assert.deepEqual(await validation.readLimitedImage(new Request('https://example.com', { method: 'POST', body: png })), png);
});

const objects = new Map();
globalThis.__projectTestEnv = { MEDIA: {
  async put(key, value, options) { objects.set(key, { value: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength), metadata: options.metadata }); },
  async getWithMetadata(key) { return objects.get(key) ?? { value: null, metadata: null }; },
} };
const contextUrl = moduleUrl('../auth/context.ts');
const { authenticatedRequest } = await import(contextUrl);
const signed = (fn, username = 'owner-a') => authenticatedRequest.run({ username }, fn);
const api = await import(moduleUrl('../app/api/project-media/route.ts', [
  ['import { env } from \'cloudflare:workers\';', 'const env = globalThis.__projectTestEnv;'],
  ["'./media-validation'", JSON.stringify(validationUrl)],
  ["'../../../auth/context'", JSON.stringify(contextUrl)],
]));

test('missing production storage is only disclosed to an authenticated owner', async () => {
  const media = globalThis.__projectTestEnv.MEDIA;
  delete globalThis.__projectTestEnv.MEDIA;
  try {
    const response = await signed(() => api.POST(new Request('https://os.cosmibit.com/api/project-media', { method: 'POST', body: png })));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /depolaması şu anda kullanılamıyor/);
    assert.equal((await api.GET(new Request('https://os.cosmibit.com/api/project-media?id=missing'))).status, 401);
  } finally { globalThis.__projectTestEnv.MEDIA = media; }
});

test('requests cannot spoof identity headers on custom, Sites or local hosts', async () => {
  for (const host of ['os.cosmibit.com', 'orbit-personal-os-emir.wise-horse-8906.chatgpt.site', 'localhost']) {
    const response = await api.POST(new Request('https://' + host + '/api/project-media', { method: 'POST', headers: { 'oai-authenticated-user-id': 'spoofed-owner', 'content-type': 'image/png' }, body: png }));
    assert.equal(response.status, 401);
  }
});

test('media API uses verified server identity and round-trips bytes', async () => {
  const base = 'https://os.cosmibit.com';
  const response = await signed(() => api.POST(new Request(base + '/api/project-media', { method: 'POST', headers: { 'content-type': 'image/png', origin: base }, body: png })));
  assert.equal(response.status, 201);
  const saved = await response.json();
  const read = await signed(() => api.GET(new Request(base + saved.url)));
  assert.equal(read.status, 200); assert.equal(read.headers.get('Content-Type'), 'image/png');
  assert.equal(read.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), png);
  assert.equal((await signed(() => api.GET(new Request(base + saved.url)), 'owner-b')).status, 404);
  assert.equal((await api.GET(new Request(base + saved.url))).status, 401);
});

test('media API rejects cross-origin writes, wrong MIME and traversal', async () => {
  const base = 'https://os.cosmibit.com/api/project-media';
  assert.equal((await signed(() => api.POST(new Request(base, { method: 'POST', headers: { origin: 'https://other.com', 'content-type': 'image/png' }, body: png })))).status, 403);
  assert.equal((await signed(() => api.POST(new Request(base, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: png })))).status, 415);
  assert.equal((await signed(() => api.GET(new Request(base + '?id=../../other')))).status, 404);
});
