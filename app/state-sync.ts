// A single atomic journal entry survives reloads during the autosave debounce.
// The acknowledged baseline lets us keep unrelated edits from another device.
export const STATE_KEY = 'orbit-personal-os';
export const PENDING_KEY = 'orbit-pending-state-v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PendingState = { state: string; base: string };
export function readPending(storage: StorageLike): PendingState | null {
  try {
    const entry = JSON.parse(storage.getItem(PENDING_KEY) || 'null');
    if (typeof entry?.state !== 'string' || typeof entry?.base !== 'string') return null;
    JSON.parse(entry.state); if (entry.base) JSON.parse(entry.base);
    return entry;
  } catch { return null; }
}
export function journalState(storage: StorageLike, state: string, base: string) {
  // Write the journal first: cache failure must not discard the pending edit.
  if (state !== base) storage.setItem(PENDING_KEY, JSON.stringify({ state, base }));
  storage.setItem(STATE_KEY, state);
}
export function acknowledgeState(storage: StorageLike, state: string) {
  const pending = readPending(storage);
  if (pending?.state === state) storage.removeItem(PENDING_KEY);
  else if (pending) storage.setItem(PENDING_KEY, JSON.stringify({ ...pending, base: state }));
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
// Same-field conflicts keep this device's explicit edit; untouched fields use
// the server. Collections with stable IDs merge item by item (including deletes).
export function rebaseState<T>(base: unknown, local: T, remote: unknown): T {
  if (equal(local, base)) return remote as T;
  if (equal(remote, base) || equal(local, remote)) return local;
  if (record(local) && record(remote) && (record(base) || base === undefined)) {
    const prior = record(base) ? base : {};
    const merged: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(prior), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = rebaseState(prior[key], local[key], remote[key]);
      if (value !== undefined) Object.defineProperty(merged, key, { value, enumerable: true, configurable: true, writable: true });
    }
    return merged as T;
  }
  const identified = (value: unknown): value is { id: string }[] => Array.isArray(value) && value.every(item => record(item) && typeof item.id === 'string');
  if (identified(local) && identified(remote) && (identified(base) || base === undefined)) {
    const byId = (items: { id: string }[]) => Object.fromEntries(items.map(item => [item.id, item]));
    const merged = rebaseState(byId(base || []), byId(local), byId(remote));
    return Object.values(merged) as T;
  }
  return local;
}
