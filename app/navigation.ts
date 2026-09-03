export const pages = ['home', 'personal', 'rebuild', 'projects', 'kibleteyn', 'programs', 'calendar', 'notes', 'archive', 'settings'] as const;
export type PageKey = typeof pages[number];
export type ViewValue = string | number | boolean | null;
export type NavigationSnapshot = { page: PageKey; project: string | null; views: Record<string, ViewValue>; layers?: Record<string, string> };
type Entry = { version: 1; index: number; snapshot: NavigationSnapshot; scroll: [number, number]; dismissed?: string[] };
export const navigationKey = '__orbitNavigation';
export const homeSnapshot: NavigationSnapshot = { page: 'home', project: null, views: {} };

type Browser = Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener' | 'scrollX' | 'scrollY' | 'scrollTo' | 'requestAnimationFrame'>;
const same = (a: NavigationSnapshot, b: NavigationSnapshot) => a.page === b.page && a.project === b.project &&
  Object.keys(a.views).length === Object.keys(b.views).length && Object.entries(a.views).every(([key, value]) => b.views[key] === value);
const withoutOverlays = (snapshot: NavigationSnapshot): NavigationSnapshot => ({ ...snapshot, views: Object.fromEntries(Object.entries(snapshot.views).filter(([key]) => !key.startsWith('overlay:'))), layers: {} });

export function routeFromUrl(href: string): NavigationSnapshot {
  const url = new URL(href);
  const project = url.searchParams.get('project') || null;
  const requested = url.searchParams.get('view');
  const page = project ? 'projects' : pages.find(page => page === requested) ?? 'home';
  return { page, project, views: {} };
}

export function routeUrl(href: string, snapshot: NavigationSnapshot): string {
  const url = new URL(href);
  if (snapshot.page === 'home') url.searchParams.delete('view');
  else url.searchParams.set('view', snapshot.page);
  if (snapshot.project) url.searchParams.set('project', snapshot.project);
  else url.searchParams.delete('project');
  return url.href;
}

function readEntry(state: unknown): Entry | null {
  if (!state || typeof state !== 'object') return null;
  const entry = (state as Record<string, unknown>)[navigationKey] as Entry | undefined;
  if (!entry || entry.version !== 1 || !Number.isSafeInteger(entry.index) || entry.index < 0) return null;
  const snapshot = entry.snapshot;
  if (!snapshot || !pages.includes(snapshot.page) || (snapshot.project !== null && typeof snapshot.project !== 'string') || (snapshot.project && snapshot.page !== 'projects')) return null;
  if (!snapshot.views || typeof snapshot.views !== 'object' || Array.isArray(snapshot.views)) return null;
  if (Object.values(snapshot.views).some(value => value !== null && !['string', 'number', 'boolean'].includes(typeof value))) return null;
  if (snapshot.layers && (typeof snapshot.layers !== 'object' || Array.isArray(snapshot.layers) || Object.values(snapshot.layers).some(value => typeof value !== 'string'))) return null;
  if (entry.dismissed && (!Array.isArray(entry.dismissed) || entry.dismissed.some(value => typeof value !== 'string'))) return null;
  if (!Array.isArray(entry.scroll) || entry.scroll.length !== 2 || !entry.scroll.every(Number.isFinite)) return null;
  return entry;
}

// Only navigation metadata belongs in history. Workspace contents and drafts
// remain in their existing persistence layer and are never rolled back by Back.
export function createNavigation(browser: Browser) {
  let snapshot = homeSnapshot;
  let index = 0;
  let started = false;
  let pending: { base: NavigationSnapshot; replace: boolean; scroll: [number, number] } | null = null;
  let previousScrollRestoration: ScrollRestoration;
  const listeners = new Set<() => void>();
  const entries = new Map<number, Entry>();
  const dismissed = new Set<string>();
  const cleanDismissed = (value: NavigationSnapshot): NavigationSnapshot => {
    const closedKeys = Object.entries(value.layers ?? {}).filter(([, id]) => dismissed.has(id)).map(([key]) => key);
    const keep = ([key]: [string, unknown]) => !closedKeys.some(closed => key === closed || key.startsWith(`${closed}/`));
    return { ...value, views: Object.fromEntries(Object.entries(value.views).filter(keep)), layers: Object.fromEntries(Object.entries(value.layers ?? {}).filter(keep)) };
  };
  const emit = () => listeners.forEach(listener => listener());
  const write = (next: NavigationSnapshot, replace: boolean, scroll: [number, number] = [browser.scrollX, browser.scrollY]) => {
    const entry: Entry = { version: 1, index, snapshot: next, scroll, dismissed: [...dismissed] };
    const state = { ...browser.history.state, [navigationKey]: entry };
    browser.history[replace ? 'replaceState' : 'pushState'](state, '', routeUrl(browser.location.href, next));
    entries.set(index, entry);
    snapshot = next;
  };
  const flush = () => {
    if (!pending) return;
    const { base, replace, scroll } = pending;
    const next = snapshot;
    pending = null;
    if (same(base, next)) return;
    const routeChanged = base.page !== next.page || base.project !== next.project;
    // Closing a multi-step overlay invalidates that opening, including earlier
    // wizard steps. A later opening gets a fresh identity, even on a new branch.
    for (const [key, id] of Object.entries(base.layers ?? {})) if (!Object.hasOwn(next.views, key)) dismissed.add(id);
    // One click may select a tab, close a dialog, and navigate. Commit that as
    // one transition; never leave hidden intermediate screens in the history.
    const cleanBase = routeChanged ? withoutOverlays(base) : cleanDismissed(base);
    write(cleanBase, true, scroll);
    if (!replace && !same(cleanBase, next)) {
      for (const key of entries.keys()) if (key > index) entries.delete(key);
      index++;
      write(next, false, routeChanged ? [0, 0] : [browser.scrollX, browser.scrollY]);
    } else write(next, true);
    if (routeChanged) browser.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  const pop = (event: PopStateEvent) => {
    const entry = readEntry(event.state);
    const previousIndex = index;
    if (entry) {
      for (const id of entry.dismissed ?? []) dismissed.add(id);
      const restored = cleanDismissed(entry.snapshot);
      index = entry.index;
      entries.set(index, entry);
      // Closing with X replaces the overlay, rather than reopening it on Back.
      // Skip the resulting identical entry in either traversal direction.
      if (same(snapshot, restored) && index !== previousIndex) {
        browser.history.go(index < previousIndex ? -1 : 1);
        return;
      }
      snapshot = restored;
    } else {
      snapshot = routeFromUrl(browser.location.href);
      entries.clear();
      index = 0;
    }
    emit();
    const target = snapshot;
    browser.requestAnimationFrame(() => {
      if (snapshot === target) browser.scrollTo({ left: entry?.scroll[0] ?? 0, top: entry?.scroll[1] ?? 0, behavior: 'instant' });
    });
  };
  const start = () => {
    if (started) return;
    started = true;
    const route = routeFromUrl(browser.location.href);
    const saved = readEntry(browser.history.state);
    previousScrollRestoration = browser.history.scrollRestoration;
    browser.history.scrollRestoration = 'manual';
    if (saved && saved.snapshot.page === route.page && saved.snapshot.project === route.project) {
      index = saved.index;
      for (const id of saved.dismissed ?? []) dismissed.add(id);
      for (const id of Object.values(saved.snapshot.layers ?? {})) dismissed.add(id);
      // A reload must not reopen a dialog whose unsaved inputs lived in memory.
      write(withoutOverlays(saved.snapshot), true, saved.scroll);
    } else {
      // A direct link gets a real in-app parent, but the home screen never traps
      // the user: Back from the root retains the browser's normal exit behavior.
      write(homeSnapshot, true, [0, 0]);
      if (route.project) { index++; write({ ...homeSnapshot, page: 'projects' }, false, [0, 0]); }
      if (route.page !== 'home') { index++; write(route, false, [0, 0]); }
    }
    browser.addEventListener('popstate', pop);
    browser.addEventListener('pagehide', flush);
    emit();
  };
  const update = (next: NavigationSnapshot, replace = false) => {
    start();
    if (same(snapshot, next)) return;
    if (!pending) { pending = { base: snapshot, replace, scroll: [browser.scrollX, browser.scrollY] }; queueMicrotask(flush); }
    else pending.replace = pending.replace && replace;
    snapshot = next;
    emit();
  };
  return {
    start,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    rememberView(key: string, value: ViewValue) {
      start();
      if (!Object.hasOwn(snapshot.views, key)) update({ ...snapshot, views: { ...snapshot.views, [key]: value }, layers: { ...snapshot.layers, ...(key.startsWith('overlay:') ? { [key]: crypto.randomUUID() } : {}) } }, true);
    },
    setView(key: string, value: ViewValue, initial: ViewValue, closeOnDefault = false) {
      start();
      const views = { ...snapshot.views };
      const layers = { ...snapshot.layers };
      if (value === initial) {
        delete views[key];
        for (const child of Object.keys(views)) if (child.startsWith(`${key}/`)) delete views[child];
      } else {
        views[key] = value;
        if (key.startsWith('overlay:') && !layers[key]) layers[key] = crypto.randomUUID();
      }
      for (const layer of Object.keys(layers)) if (!Object.hasOwn(views, layer)) delete layers[layer];
      update({ ...snapshot, views, layers }, closeOnDefault && value === initial);
    },
    navigate(page: PageKey, project: string | null = null) {
      start();
      const clean = withoutOverlays(snapshot);
      if (snapshot.page === page && snapshot.project === project) { update(clean, true); return; }
      update({ ...clean, page, project });
    },
    backTo(page: PageKey) {
      start();
      flush();
      const target = [...entries.values()].filter(entry => entry.index < index && entry.snapshot.page === page && !entry.snapshot.project && same(cleanDismissed(entry.snapshot), withoutOverlays(entry.snapshot))).sort((a, b) => b.index - a.index)[0];
      if (target) browser.history.go(target.index - index);
      else update({ ...withoutOverlays(snapshot), page, project: null }, true);
    },
    backToView(key: string, value: ViewValue, initial: ViewValue) {
      start();
      flush();
      const target = [...entries.values()].filter(entry => entry.index < index && entry.snapshot.page === snapshot.page && entry.snapshot.project === snapshot.project &&
        (entry.snapshot.layers?.[key] ?? null) === (snapshot.layers?.[key] ?? null) &&
        (Object.hasOwn(entry.snapshot.views, key) ? entry.snapshot.views[key] : initial) === value).sort((a, b) => b.index - a.index)[0];
      if (target) browser.history.go(target.index - index);
      else update({ ...snapshot, views: { ...snapshot.views, [key]: value } }, true);
    },
    dispose() {
      if (!started) return;
      flush();
      browser.removeEventListener('popstate', pop);
      browser.removeEventListener('pagehide', flush);
      browser.history.scrollRestoration = previousScrollRestoration;
      started = false;
    },
  };
}
