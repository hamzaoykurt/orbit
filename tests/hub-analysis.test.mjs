import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';

const { extractPage, isSufficient } = await import(loadModuleUrl(new URL('../app/api/hub/page-extract.ts', import.meta.url)));
const { loadWebContent } = await import(loadModuleUrl(new URL('../app/api/hub/content-source.ts', import.meta.url)));
const { buildPrompt, fromModel, fromContent, ESTIMATE_NOTICE } = await import(loadModuleUrl(new URL('../app/api/hub/analysis.ts', import.meta.url)));
const { normalizeHubLinks } = await import(loadModuleUrl(new URL('../app/hub/hub-model.ts', import.meta.url)));

const page = `<!doctype html><html lang="en"><head><title> Swishy &amp; Co </title>
<meta name="description" content="Plain description">
<meta property="og:title" content="Swishy: AI motion designer">
<meta property="og:description" content='Create animations from a prompt &#8211; fast'>
<meta property="og:image" content="/og.png"><style>.x{color:red}</style><script>var secret=1</script></head>
<body><header><h1>Animate anything</h1></header><main><p>Describe what you want.</p><h2>How it works</h2><p>Pick a template &amp; go.</p></main><script>alert(1)</script></body></html>`;

test('HTML parsing: title, meta, og, headings, visible text without scripts', () => {
  const facts = extractPage(page, 'https://swishy.ai/');
  assert.equal(facts.title, 'Swishy & Co');
  assert.equal(facts.description, 'Plain description');
  assert.equal(facts.ogTitle, 'Swishy: AI motion designer');
  assert.equal(facts.ogDescription, 'Create animations from a prompt – fast');
  assert.equal(facts.ogImage, 'https://swishy.ai/og.png');
  assert.deepEqual(facts.headings, ['Animate anything', 'How it works']);
  assert.match(facts.text, /Describe what you want\./);
  assert.match(facts.text, /Pick a template & go\./);
  assert.doesNotMatch(facts.text, /secret|alert|color:red/);
  assert.equal(facts.lang, 'en');
  assert.equal(isSufficient(facts), true);
  assert.equal(isSufficient(extractPage('<html><head><title>x</title></head><body>hi</body></html>', 'https://a.example/')), false);
  assert.ok(extractPage('<body>' + 'word '.repeat(5000) + '</body>', 'https://a.example/').text.length <= 6000);
});

const html = body => () => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const status = code => () => new Response('blocked', { status: code });
const router = (routes) => { const calls = []; return { calls, transport: async (url) => { const key = String(url); calls.push(key); const handler = Object.entries(routes).find(([prefix]) => key.startsWith(prefix)); if (!handler) throw new Error('unexpected ' + key); return handler[1](); } }; };
const readerText = '# Swishy reader\n' + 'This page lets you make animations from text prompts. '.repeat(6);
const target = new URL('https://www.swishy.ai/');

test('order: a readable page is used directly and the reader is never called', async () => {
  const { transport, calls } = router({ 'https://www.swishy.ai/': html(page) });
  const content = await loadWebContent(target, { transport, sleep: async () => {} });
  assert.equal(content.source, 'direct');
  assert.equal(content.title, 'Swishy: AI motion designer');
  assert.equal(content.description, 'Create animations from a prompt – fast');
  assert.deepEqual(content.images, ['https://www.swishy.ai/og.png']);
  assert.equal(calls.length, 1);
});

test('order: blocked direct fetch falls back to r.jina.ai', async () => {
  const { transport, calls } = router({ 'https://www.swishy.ai/': status(403), 'https://r.jina.ai/': () => new Response(readerText, { status: 200 }) });
  const content = await loadWebContent(target, { transport, sleep: async () => {} });
  assert.equal(content.source, 'reader'); assert.equal(content.quality, 'full');
  assert.equal(content.title, 'Swishy reader');
  assert.ok(calls[0].startsWith('https://www.swishy.ai/') && calls[1].startsWith('https://r.jina.ai/'));
});

test('order: thin direct page + failing reader keeps the head metadata; nothing at all gives quality none', async () => {
  const thin = '<html><head><title>Thin</title></head><body>hi</body></html>';
  const meta = await loadWebContent(target, { transport: router({ 'https://www.swishy.ai/': html(thin), 'https://r.jina.ai/': status(429) }).transport, sleep: async () => {} });
  assert.equal(meta.quality, 'meta'); assert.equal(meta.title, 'Thin');
  const none = await loadWebContent(target, { transport: router({ 'https://www.swishy.ai/': status(403), 'https://r.jina.ai/': status(429) }).transport, sleep: async () => {} });
  assert.equal(none.quality, 'none'); assert.equal(none.source, 'none');
});

test('internal targets are rejected before any request is made', async () => {
  const { transport, calls } = router({});
  await assert.rejects(loadWebContent(new URL('http://169.254.169.254/latest'), { transport }), /iç ağ|Yönlendirme/);
  assert.equal(calls.length, 0);
});

test('unreadable page: prompt asks for a cautious guess and the result is labelled as estimated', () => {
  const empty = { title: '', description: '', text: '' };
  const prompt = buildPrompt(target, 'web', empty, true);
  assert.match(prompt, /TAHMİNİ/); assert.match(prompt, /swishy\.ai/); assert.match(prompt, /purpose/);
  assert.doesNotMatch(buildPrompt(target, 'web', { ...empty, text: 'Gerçek içerik' }, false), /TAHMİNİ/);
  const result = fromModel(target, 'web', { title: 'Swishy', summary: 'Muhtemelen animasyon aracı.', purpose: 'Animasyon üretmek için kullanılır olabilir.', category: 'tasarım' }, { quality: 'none', title: '' }, {}, true);
  assert.equal(result.estimated, true); assert.equal(result.notice, ESTIMATE_NOTICE); assert.match(ESTIMATE_NOTICE, /^Tahmini analiz: sayfa okunamadı/);
  assert.equal(result.mainCategory, 'Tasarım');
  const real = fromModel(target, 'web', { title: 'Swishy', summary: 'Özet.', purpose: 'Animasyon yapar.', category: 'Araçlar' }, { quality: 'full', title: '' }, {}, false);
  assert.equal(real.estimated, undefined); assert.equal(real.notice, undefined); assert.equal(real.purpose, 'Animasyon yapar.');
});

test('without a model key the analysis is built from the page itself', () => {
  const analysis = fromContent(target, 'web', { quality: 'meta', source: 'direct', title: 'Swishy: AI motion designer', description: 'Create animations from a prompt', text: '', images: [] }, {});
  assert.equal(analysis.title, 'Swishy: AI motion designer'); assert.equal(analysis.summary, 'Create animations from a prompt'); assert.equal(analysis.estimated, undefined);
  const nothing = fromContent(target, 'web', { quality: 'none', source: 'none', title: '', description: '', text: '', images: [] }, {});
  assert.equal(nothing.title, 'swishy.ai'); assert.match(nothing.notice, /okunamadı/);
});

test('Hub model keeps purpose and the estimated flag and stays compatible with old links', () => {
  const base = { id: '1', url: 'https://a.example/', title: 'A', platform: 'web' };
  const [withNew] = normalizeHubLinks([{ ...base, purpose: 'Bir şeye yarar.', estimated: true }]);
  assert.equal(withNew.purpose, 'Bir şeye yarar.'); assert.equal(withNew.estimated, true);
  const [old] = normalizeHubLinks([base]);
  assert.equal('purpose' in old, false); assert.equal('estimated' in old, false);
});
