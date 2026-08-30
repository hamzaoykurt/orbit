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
  async put(key, value, options) { objects.set(key, { body: value, httpMetadata: options.httpMetadata }); },
  async get(key) { return objects.get(key) ?? null; },
} };
const api = await import(moduleUrl('../app/api/project-media/route.ts', [
  ['import { env } from \'cloudflare:workers\';', 'const env = globalThis.__projectTestEnv;'],
  ["'./media-validation'", JSON.stringify(validationUrl)],
]));

test('missing production storage reports a clear error without breaking the deployment', async () => {
  const media = globalThis.__projectTestEnv.MEDIA;
  delete globalThis.__projectTestEnv.MEDIA;
  try {
    const response = await api.POST(new Request('https://os.cosmibit.com/api/project-media', { method: 'POST', body: png }));
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /depolaması henüz etkin değil/);
    assert.equal((await api.GET(new Request('https://os.cosmibit.com/api/project-media?id=missing'))).status, 503);
  } finally { globalThis.__projectTestEnv.MEDIA = media; }
});
test('direct custom-domain requests cannot spoof Sites identity headers', async () => {
  const response = await api.POST(new Request('https://os.cosmibit.com/api/project-media', { method: 'POST', headers: { 'oai-authenticated-user-id': 'spoofed-owner', 'content-type': 'image/png' }, body: png }));
  assert.equal(response.status, 401);
});
test('media API authenticates, scopes ownership, and round-trips bytes', async () => {
  const anonymous = await api.POST(new Request('https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site/api/project-media', { method: 'POST', body: png }));
  assert.equal(anonymous.status, 401);
  const response = await api.POST(new Request('https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site/api/project-media', { method: 'POST', headers: { 'oai-authenticated-user-id': 'owner-a', 'content-type': 'image/png', origin: 'https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site' }, body: png }));
  assert.equal(response.status, 201);
  const saved = await response.json();
  const read = await api.GET(new Request(`https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site${saved.url}`, { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
  assert.equal(read.status, 200); assert.equal(read.headers.get('Content-Type'), 'image/png');
  assert.equal(read.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), png);
  assert.equal((await api.GET(new Request(`https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site${saved.url}`, { headers: { 'oai-authenticated-user-id': 'owner-b' } }))).status, 404);
  assert.equal((await api.GET(new Request(`https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site${saved.url}`))).status, 401);
});
test('media API rejects cross-origin writes, wrong MIME and traversal', async () => {
  const headers = { 'oai-authenticated-user-id': 'owner-a', 'content-type': 'image/png' };
  assert.equal((await api.POST(new Request('https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site/api/project-media', { method: 'POST', headers: { ...headers, origin: 'https://other.com' }, body: png }))).status, 403);
  assert.equal((await api.POST(new Request('https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site/api/project-media', { method: 'POST', headers: { ...headers, 'content-type': 'image/jpeg' }, body: png }))).status, 415);
  assert.equal((await api.GET(new Request('https://orbit-personal-os-emir.wise-horse-8906.chatgpt.site/api/project-media?id=../../other', { headers }))).status, 404);
});
