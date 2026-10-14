import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModuleUrl } from './load-module.mjs';
const { routeFromUrl, pages } = await import(loadModuleUrl(new URL('../app/navigation.ts', import.meta.url)));
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('old Rebuild and Program URLs still resolve (deep links, shortcuts, notifications)', () => {
  assert.equal(routeFromUrl('https://orbit.test/?view=rebuild').page, 'rebuild');
  assert.equal(routeFromUrl('https://orbit.test/?view=weekplan').page, 'weekplan');
  assert.ok(pages.includes('rebuild') && pages.includes('weekplan'));
});

test('sidebar has a single Program entry and both routes mark it active', () => {
  const navBlock = page.slice(page.indexOf('const nav:'), page.indexOf('];', page.indexOf('const nav:')));
  assert.ok(!/id: 'rebuild'/.test(navBlock), 'rebuild is not a separate sidebar item');
  assert.match(page, /page === 'weekplan' && active === 'rebuild'/);
});

test('both routes render inside the shared Program hub', () => {
  assert.match(page, /renderProgramHub\('week'/);
  assert.match(page, /renderProgramHub\('journey'/);
});

test('manifest URL carries a version so the service worker never serves a stale manifest', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const versions = [...layout.matchAll(/manifest\.webmanifest\?v=(\d+)/g)].map(match => match[1]);
  assert.ok(versions.length >= 2 && new Set(versions).size === 1, 'metadata and <link> use the same version');
  assert.ok(Number(versions[0]) >= 10, 'bumped after the background_color change');
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.background_color, '#F5EADA');
  assert.equal(manifest.theme_color, '#F5EADA');
});
