import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { safeHttpUrl, externalIntentUrl, intentForExternalClick } = await import(loadModuleUrl(new URL('../app/external-link.ts', import.meta.url)));

test('only http(s) addresses without credentials count as external links', () => {
  assert.equal(safeHttpUrl('https://swishy.ai/a?b=1'), 'https://swishy.ai/a?b=1');
  assert.equal(safeHttpUrl(' http://example.com '), 'http://example.com/');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'intent://x#Intent;end', 'ftp://a.example', 'https://user:pw@a.example/', '//a.example', 'a.example', '', '   ', null, undefined, 5]) {
    assert.equal(safeHttpUrl(bad), null, String(bad));
  }
});

test('intent URL keeps the https address as fallback and refuses anything unsafe', () => {
  const intent = externalIntentUrl('https://www.youtube.com/watch?v=abc#t=5');
  assert.match(intent, /^intent:\/\/www\.youtube\.com\/watch\?v=abc#Intent;scheme=https;action=android\.intent\.action\.VIEW;/);
  assert.ok(intent.includes('S.browser_fallback_url=' + encodeURIComponent('https://www.youtube.com/watch?v=abc#t=5')));
  assert.ok(intent.endsWith(';end'));
  assert.equal(externalIntentUrl('javascript:alert(1)'), null);
  assert.equal(externalIntentUrl('https://u:p@a.example/'), null);
});

test('click redirect: only external http(s) links in the installed Android app', () => {
  const base = { pageOrigin: 'https://os.cosmibit.com', android: true, standalone: true };
  assert.match(intentForExternalClick({ ...base, href: 'https://prompt-motion.com/' }), /^intent:\/\/prompt-motion\.com\//);
  assert.equal(intentForExternalClick({ ...base, href: 'https://os.cosmibit.com/?view=hub' }), null, 'same-origin stays in the app');
  assert.equal(intentForExternalClick({ ...base, href: 'javascript:alert(1)' }), null);
  assert.equal(intentForExternalClick({ ...base, href: 'intent://open#Intent;scheme=profitness;end' }), null, 'existing Fitness intent link is untouched');
  assert.equal(intentForExternalClick({ ...base, href: 'https://prompt-motion.com/', standalone: false }), null, 'browser tab: normal target=_blank');
  assert.equal(intentForExternalClick({ ...base, href: 'https://prompt-motion.com/', android: false }), null, 'desktop/iOS: normal target=_blank');
  assert.equal(intentForExternalClick({ ...base, href: null }), null);
});
