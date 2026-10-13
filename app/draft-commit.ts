// Text fields keep a local draft while typing and commit the merged patch to the
// shared workspace state after a short pause, on blur, and when the editor closes.
type Timers = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void; now?: () => number };
const browserTimers: Timers = { set: (callback, ms) => setTimeout(callback, ms), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>), now: () => Date.now() };

export function createDraftCommitter<T extends Record<string, unknown>>(commit: (patch: Partial<T>) => void, delay: number, timers: Timers = browserTimers, maxWait = 1500) {
  let patch: Partial<T> = {};
  let timer: unknown = null;
  let firstAt = 0;
  const now = () => timers.now?.() ?? 0;
  const flush = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    if (!Object.keys(patch).length) return;
    const ready = patch; patch = {}; firstAt = 0;
    commit(ready);
  };
  return {
    // Trailing debounce; continuous typing still commits at least every maxWait ms.
    set(change: Partial<T>) {
      if (!Object.keys(patch).length) firstAt = now();
      patch = { ...patch, ...change };
      if (timer !== null) timers.clear(timer);
      timer = timers.set(flush, Math.max(0, Math.min(delay, maxWait - (now() - firstAt))));
    },
    flush,
    // Used when the note is deleted or archived: a later flush must not write it back.
    discard() { if (timer !== null) timers.clear(timer); timer = null; patch = {}; firstAt = 0; },
    get pending() { return Object.keys(patch).length > 0; },
  };
}
