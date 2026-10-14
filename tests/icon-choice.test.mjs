import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModuleUrl } from './load-module.mjs';
const { iconChoice, manifestForIcon, DARK_COLOR } = await import(loadModuleUrl(new URL('../auth/manifest-variant.ts', import.meta.url)));
const source = readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');

test('icon defaults to light and follows the cookie or ?icon=', () => {
  assert.equal(iconChoice(new URL('https://o.test/manifest.webmanifest'), null), 'light');
  assert.equal(iconChoice(new URL('https://o.test/manifest.webmanifest'), 'a=1; orbit_icon=dark'), 'dark');
  assert.equal(iconChoice(new URL('https://o.test/manifest.webmanifest'), 'orbit_icon=light'), 'light');
  assert.equal(iconChoice(new URL('https://o.test/manifest.webmanifest?icon=dark'), null), 'dark');
  assert.equal(iconChoice(new URL('https://o.test/manifest.webmanifest?icon=light'), 'orbit_icon=dark'), 'light');
  assert.equal(iconChoice(new URL('https://o.test/manifest.webmanifest'), 'orbit_icon=evil'), 'light');
});

test('light manifest is returned unchanged', () => {
  assert.equal(manifestForIcon(source, 'light'), source);
});

test('dark manifest swaps icons, maskable icons, shortcuts and colours; identity stays', () => {
  const dark = JSON.parse(manifestForIcon(source, 'dark'));
  const light = JSON.parse(source);
  assert.equal(dark.id, light.id); assert.equal(dark.start_url, light.start_url); assert.equal(dark.scope, light.scope);
  assert.equal(dark.background_color, DARK_COLOR); assert.equal(dark.theme_color, DARK_COLOR);
  const srcs = JSON.stringify([dark.icons, dark.shortcuts]);
  assert.ok(!/orbit-icon-v8-|orbit-favicon-v8|icon-maskable-(192|512)\.png/.test(srcs), 'no light icon left');
  assert.ok(dark.icons.some(icon => icon.purpose === 'maskable' && /maskable-dark-v8-512/.test(icon.src)));
});
