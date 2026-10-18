import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { extractClipboardUrl, readClipboardUrl } = await import(loadModuleUrl(new URL('../app/hub/clipboard-link.ts', import.meta.url)));

test('a copied web address is detected, with surrounding whitespace, quotes or angle brackets removed', () => {
  assert.equal(extractClipboardUrl('https://swishy.ai/'), 'https://swishy.ai/');
  assert.equal(extractClipboardUrl('  http://example.com/a?b=1#c \n'), 'http://example.com/a?b=1#c');
  assert.equal(extractClipboardUrl('<https://example.com/x>'), 'https://example.com/x');
  assert.equal(extractClipboardUrl('"https://example.com/x"'), 'https://example.com/x');
  assert.equal(extractClipboardUrl('https://www.youtube.com/watch?v=abc123'), 'https://www.youtube.com/watch?v=abc123');
});

test('anything that is not a single http(s) address is ignored', () => {
  for (const value of ['', '   ', 'merhaba dünya', 'bakın https://example.com güzel', 'https://a.example\nhttps://b.example', 'ftp://example.com/x', 'javascript:alert(1)', 'file:///etc/passwd', 'swishy.ai', 'http://localhost', 'https://user:pw@example.com/', 'https://', 'x'.repeat(3000), null, undefined, 42, {}]) {
    assert.equal(extractClipboardUrl(value), null, String(value).slice(0, 40));
  }
});

test('reading the clipboard never throws: denied, missing API, empty or non-URL text all give null', async () => {
  assert.equal(await readClipboardUrl({ readText: async () => 'https://swishy.ai/' }), 'https://swishy.ai/');
  assert.equal(await readClipboardUrl({ readText: async () => { throw new DOMException('denied', 'NotAllowedError'); } }), null);
  assert.equal(await readClipboardUrl({ readText: async () => 'just text' }), null);
  assert.equal(await readClipboardUrl({ readText: async () => '' }), null);
  assert.equal(await readClipboardUrl(undefined), null);
  assert.equal(await readClipboardUrl({}), null);
});
