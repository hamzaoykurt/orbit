// Coalesces bursts of edits into one expensive write (serialize + localStorage).
// flush() is synchronous so pagehide/visibilitychange can still persist in time.
type Timers = { set: (callback: () => void, ms: number) => unknown; clear: (id: unknown) => void; now: () => number };
const browserTimers: Timers = { set: (callback, ms) => setTimeout(callback, ms), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>), now: () => Date.now() };

export function createCoalescedWriter<T>(options: { delay: number; maxWait: number; run: () => T; timers?: Timers }) {
  const timers = options.timers ?? browserTimers;
  let timer: unknown = null;
  let firstDirtyAt = 0;
  let dirty = false;
  let last: T | undefined;
  const clear = () => { if (timer !== null) timers.clear(timer); timer = null; };
  const flush = (): T => {
    clear();
    if (dirty || last === undefined) { dirty = false; firstDirtyAt = 0; last = options.run(); }
    return last as T;
  };
  return {
    // Trailing debounce, but a continuous burst still writes every maxWait ms.
    schedule() {
      const now = timers.now();
      if (!dirty) firstDirtyAt = now;
      dirty = true;
      clear();
      timer = timers.set(() => { timer = null; flush(); }, Math.max(0, Math.min(options.delay, options.maxWait - (now - firstDirtyAt))));
    },
    flush,
    cancel() { clear(); },
    get pending() { return dirty; },
  };
}
