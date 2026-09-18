import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../app/clipboard-media.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clipboard = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function installBrowserMocks() {
  const writes = [];
  const textWrites = [];
  class MockClipboardItem { constructor(data) { this.data = data; } }
  class MockImage {
    naturalWidth = 1200;
    naturalHeight = 800;
    set src(value) { this.value = value; }
    async decode() {}
  }
  const context = {
    drawImage() {}, fillRect() {}, fillText() {},
    set fillStyle(value) { this._fillStyle = value; },
    set font(value) { this._font = value; },
    set textBaseline(value) { this._textBaseline = value; },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
    async write(items) { writes.push(items); },
    async writeText(text) { textWrites.push(text); },
  } } });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: MockClipboardItem });
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { return {
    width: 0, height: 0,
    getContext() { return context; },
    toBlob(callback) { callback(new Blob(['png'], { type: 'image/png' })); },
  }; } } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Blob(['image'], { type: 'image/jpeg' }), { status: 200 });
  return { writes, textWrites, restore() { globalThis.fetch = originalFetch; } };
}

test('plain task copy keeps using the text clipboard', async () => {
  const browser = installBrowserMocks();
  try {
    await clipboard.copyTextWithImages('Görev metni', []);
    assert.deepEqual(browser.textWrites, ['Görev metni']);
    assert.equal(browser.writes.length, 0);
  } finally { browser.restore(); }
});

test('task copy writes text and its image as one clipboard item', async () => {
  const browser = installBrowserMocks();
  try {
    await clipboard.copyTextWithImages('Görev metni', [{ url: '/api/project-media?id=1', name: 'referans.jpg' }]);
    assert.equal(browser.writes.length, 1);
    const item = browser.writes[0][0];
    assert.deepEqual(Object.keys(item.data).sort(), ['image/png', 'text/plain']);
    assert.equal(await item.data['text/plain'].text(), 'Görev metni');
    assert.equal((await item.data['image/png']).type, 'image/png');
  } finally { browser.restore(); }
});

test('multiple task images are combined into the same clipboard image', async () => {
  const browser = installBrowserMocks();
  try {
    await clipboard.copyTextWithImages('Görev metni', [
      { url: '/api/project-media?id=1', name: 'önce.jpg' },
      { url: '/api/project-media?id=2', name: 'sonra.jpg' },
    ]);
    assert.equal(browser.writes.length, 1);
    const item = browser.writes[0][0];
    assert.deepEqual(Object.keys(item.data).sort(), ['image/png', 'text/plain']);
    assert.equal((await item.data['image/png']).type, 'image/png');
  } finally { browser.restore(); }
});

test('individual image copy writes a PNG clipboard item', async () => {
  const browser = installBrowserMocks();
  try {
    await clipboard.copyImage({ url: '/api/project-media?id=2', name: 'çizim.webp' });
    const item = browser.writes[0][0];
    assert.deepEqual(Object.keys(item.data), ['image/png']);
    assert.equal((await item.data['image/png']).type, 'image/png');
  } finally { browser.restore(); }
});
