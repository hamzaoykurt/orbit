import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleUrl } from './load-module.mjs';
const { createNavigation, navigationKey, routeFromUrl, routeUrl } = await import(loadModuleUrl(new URL('../app/navigation.ts', import.meta.url)));

function harness(href = 'https://orbit.test/') {
  const stack = [{ url: 'https://outside.test/', state: null }, { url: href, state: { router: 'preserved' } }];
  let cursor = 1;
  const listeners = new Map();
  const browser = {
    location: { href }, scrollX: 0, scrollY: 0,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
    requestAnimationFrame: callback => { queueMicrotask(callback); return 1; },
    scrollTo: ({ top, left }) => { browser.scrollY = top; browser.scrollX = left; },
    history: {
      scrollRestoration: 'auto',
      get state() { return stack[cursor].state; },
      replaceState(state, _, url) { stack[cursor] = { url, state: structuredClone(state) }; browser.location.href = url; },
      pushState(state, _, url) { stack.splice(cursor + 1); stack.push({ url, state: structuredClone(state) }); cursor++; browser.location.href = url; },
      go(delta) {
        const target = cursor + delta;
        if (target < 0 || target >= stack.length) return;
        cursor = target; browser.location.href = stack[cursor].url;
        if (new URL(browser.location.href).origin === 'https://orbit.test') queueMicrotask(() => listeners.get('popstate')?.({ state: stack[cursor].state }));
      },
    },
  };
  let navigation = createNavigation(browser);
  navigation.start();
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return {
    browser, stack, get navigation() { return navigation; }, get snapshot() { return navigation.getSnapshot(); },
    settle,
    async go(page, project) { navigation.navigate(page, project); await settle(); },
    async view(key, value, initial = null, close = false) { navigation.setView(key, value, initial, close); await settle(); },
    async back() { browser.history.go(-1); await settle(); },
    async forward() { browser.history.go(1); await settle(); },
    reload() { navigation.dispose(); navigation = createNavigation(browser); navigation.start(); },
  };
}

test('every primary screen participates in Back and Forward without leaving the app', async () => {
  const app = harness();
  const pages = ['personal', 'rebuild', 'projects', 'kibleteyn', 'programs', 'calendar', 'notes', 'archive', 'settings'];
  for (const page of pages) await app.go(page);
  for (const page of [...pages.slice(0, -1)].reverse().concat('home')) {
    await app.back(); assert.equal(app.snapshot.page, page); assert.equal(new URL(app.browser.location.href).origin, 'https://orbit.test');
  }
  for (const page of pages) { await app.forward(); assert.equal(app.snapshot.page, page); }
});

test('project tabs unwind before the project, and then return to the source screen', async () => {
  const app = harness();
  await app.go('rebuild'); await app.go('projects', 'one');
  await app.view('project:one:tab', 'tasks', 'overview');
  await app.view('project:one:tab', 'resources', 'overview');
  await app.back(); assert.equal(app.snapshot.views['project:one:tab'], 'tasks');
  await app.back(); assert.equal(app.snapshot.project, 'one'); assert.equal(app.snapshot.views['project:one:tab'], undefined);
  await app.back(); assert.equal(app.snapshot.page, 'rebuild'); assert.equal(app.snapshot.project, null);
  await app.forward(); assert.equal(app.snapshot.project, 'one');
});

test('Back closes dialogs and menus one at a time, preserving the underlying screen', async () => {
  const app = harness();
  await app.go('notes');
  await app.view('notes:selected', 'note-1');
  await app.view('overlay:modal', 'search');
  await app.back(); assert.equal(app.snapshot.views['overlay:modal'], undefined); assert.equal(app.snapshot.views['notes:selected'], 'note-1');
  await app.back(); assert.equal(app.snapshot.page, 'notes'); assert.equal(app.snapshot.views['notes:selected'], undefined);
  await app.view('overlay:mobile-menu', true, false);
  await app.back(); assert.equal(app.snapshot.page, 'notes'); assert.equal(app.snapshot.views['overlay:mobile-menu'], undefined);
});

test('closing a dialog with X leaves no extra Back press or reopened dialog', async () => {
  const app = harness(); await app.go('projects');
  await app.view('overlay:modal', 'quick');
  await app.view('overlay:modal', null, null, true);
  await app.back(); assert.equal(app.snapshot.page, 'home');
  await app.forward(); assert.equal(app.snapshot.page, 'projects'); assert.equal(app.snapshot.views['overlay:modal'], undefined);
  await app.forward(); assert.equal(app.snapshot.views['overlay:modal'], undefined);
});

test('menu navigation strips the menu from the return screen', async () => {
  const app = harness(); await app.go('personal');
  await app.view('overlay:mobile-menu', true, false);
  await app.go('calendar'); await app.back();
  assert.equal(app.snapshot.page, 'personal'); assert.equal(app.snapshot.views['overlay:mobile-menu'], undefined);
  await app.back(); assert.equal(app.snapshot.page, 'home');
});

test('a single click that closes a dialog, selects a tab and navigates is atomic', async () => {
  const app = harness(); await app.go('personal'); await app.view('overlay:modal', 'notifications');
  const count = app.stack.length;
  app.navigation.setView('overlay:modal', null, null, true);
  app.navigation.setView('settings:tab', 'notifications', 'general');
  app.navigation.navigate('settings');
  await app.settle();
  assert.equal(app.stack.length, count + 1);
  assert.equal(app.snapshot.page, 'settings'); assert.equal(app.snapshot.views['settings:tab'], 'notifications');
  await app.back(); assert.equal(app.snapshot.page, 'personal'); assert.equal(app.snapshot.views['overlay:modal'], undefined);
  await app.back(); assert.equal(app.snapshot.page, 'home');
});

test('deep-linked projects have project-list and home parents', async () => {
  const app = harness('https://orbit.test/?project=a%2Fb&source=link');
  assert.equal(app.snapshot.project, 'a/b');
  await app.back(); assert.equal(app.snapshot.page, 'projects'); assert.equal(app.snapshot.project, null);
  await app.back(); assert.equal(app.snapshot.page, 'home');
  await app.back(); assert.equal(app.browser.location.href, 'https://outside.test/');
});

test('reload restores the current screen and tab, but never a transient modal', async () => {
  const app = harness(); await app.go('projects', 'one'); await app.view('project:one:tab', 'tasks', 'overview'); await app.view('overlay:modal', 'event');
  const count = app.stack.length; app.reload();
  assert.equal(app.snapshot.project, 'one'); assert.equal(app.snapshot.views['project:one:tab'], 'tasks');
  assert.equal(app.snapshot.views['overlay:modal'], undefined); assert.equal(app.stack.length, count);
  await app.back(); assert.equal(app.snapshot.views['project:one:tab'], undefined);
});

test('repeated destination and no-op setters do not create history entries', async () => {
  const app = harness(); await app.go('notes'); const count = app.stack.length;
  await app.go('notes'); await app.view('overlay:modal', null, null, true);
  assert.equal(app.stack.length, count);
  await app.back(); assert.equal(app.snapshot.page, 'home');
});

test('project board button unwinds nested tabs instead of pushing the project again', async () => {
  const app = harness(); await app.go('projects'); await app.go('projects', 'one'); await app.view('project:one:tab', 'tasks', 'overview');
  app.navigation.backTo('projects'); await app.settle();
  assert.equal(app.snapshot.project, null); assert.equal(app.snapshot.page, 'projects');
  await app.back(); assert.equal(app.snapshot.page, 'home');
});

test('back/forward never restores old saved data and preserves foreign router state', async () => {
  const app = harness(); const workspace = { note: 'before' };
  await app.go('notes'); await app.view('notes:selected', 'note-1'); workspace.note = 'edited'; await app.back();
  assert.equal(workspace.note, 'edited');
  assert.equal(app.browser.history.state.router, 'preserved');
  assert.equal(JSON.stringify(app.browser.history.state[navigationKey]).includes('edited'), false);
});

test('wizard positions restore independently of saved answers', async () => {
  const app = harness(); await app.go('projects'); await app.view('overlay:creator', true, false);
  app.navigation.rememberView('overlay:creator/position:draft', 'idea:0'); await app.settle();
  await app.view('overlay:creator/position:draft', 'questions:0');
  await app.view('overlay:creator/position:draft', 'questions:1');
  await app.back(); assert.equal(app.snapshot.views['overlay:creator/position:draft'], 'questions:0');
  await app.back(); assert.equal(app.snapshot.views['overlay:creator/position:draft'], 'idea:0');
  await app.back(); assert.equal(app.snapshot.views['overlay:creator'], undefined);
  await app.forward(); assert.equal(app.snapshot.views['overlay:creator/position:draft'], 'idea:0');
});

test('Back restores scroll, new routes start at the top, and disposal restores browser policy', async () => {
  const app = harness(); await app.go('personal'); app.browser.scrollY = 725;
  app.navigation.navigate('calendar'); app.browser.scrollY = 0; await app.settle();
  assert.equal(app.browser.scrollY, 0);
  await app.back(); assert.equal(app.browser.scrollY, 725);
  app.navigation.dispose(); assert.equal(app.browser.history.scrollRestoration, 'auto');
});

test('closing a multi-step wizard never reopens an earlier step, including after reload', async () => {
  const app = harness(); await app.go('projects');
  await app.view('overlay:creator', true, false);
  await app.view('overlay:creator/position:draft', 'questions:0');
  await app.view('overlay:creator/position:draft', 'questions:1');
  await app.view('overlay:creator', false, false, true);
  app.reload(); await app.back();
  assert.equal(app.snapshot.page, 'home'); assert.equal(app.snapshot.views['overlay:creator'], undefined);
  await app.forward(); assert.equal(app.snapshot.page, 'projects'); assert.equal(app.snapshot.views['overlay:creator'], undefined);
});

test('a fresh overlay opening after Back is not invalidated by an old dismissed opening', async () => {
  const app = harness(); await app.go('projects'); await app.view('overlay:creator', true, false);
  await app.view('overlay:creator/position:draft', 'questions:0'); await app.view('overlay:creator', false, false, true);
  await app.back(); await app.go('projects'); await app.view('overlay:creator', true, false);
  await app.view('overlay:creator/position:draft', 'questions:1'); await app.back();
  assert.equal(app.snapshot.views['overlay:creator'], true);
  await app.back(); assert.equal(app.snapshot.page, 'projects'); assert.equal(app.snapshot.views['overlay:creator'], undefined);
});

test('the wizard Back button consumes the same step as the hardware Back button', async () => {
  const app = harness(); await app.go('projects'); await app.view('overlay:creator', true, false);
  app.navigation.rememberView('overlay:creator/position:draft', 'idea:0'); await app.settle();
  await app.view('overlay:creator/position:draft', 'questions:0'); await app.view('overlay:creator/position:draft', 'questions:1');
  app.navigation.backToView('overlay:creator/position:draft', 'questions:0', 'idea:0'); await app.settle();
  assert.equal(app.snapshot.views['overlay:creator/position:draft'], 'questions:0');
  await app.back(); assert.equal(app.snapshot.views['overlay:creator/position:draft'], 'idea:0');
});

test('new navigation after Back replaces the forward branch', async () => {
  const app = harness(); await app.go('personal'); await app.go('notes'); await app.back(); await app.go('calendar');
  await app.forward(); assert.equal(app.snapshot.page, 'calendar');
  await app.back(); assert.equal(app.snapshot.page, 'personal');
});

test('URLs validate page names, preserve unrelated parameters and encode project IDs', () => {
  assert.equal(routeFromUrl('https://orbit.test/?view=bogus').page, 'home');
  assert.equal(routeFromUrl('https://orbit.test/?view=rebuild').page, 'rebuild');
  assert.equal(routeUrl('https://orbit.test/?source=test#heading', { page: 'projects', project: 'a&b', views: {} }), 'https://orbit.test/?source=test&view=projects&project=a%26b#heading');
});
