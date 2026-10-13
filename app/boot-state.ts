import { PENDING_KEY, STATE_KEY, readPending, rebaseState } from './state-sync';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Device copy used to paint immediately. `base` is the last state the server
// acknowledged (or the cached copy itself when nothing is pending).
export type BootSnapshot = { state: unknown; base: string; pending: boolean } | null;
export function readBootSnapshot(storage: StorageLike): BootSnapshot {
  try {
    const pending = readPending(storage);
    const saved = pending?.state || storage.getItem(STATE_KEY);
    if (!saved) return null;
    const state = JSON.parse(saved);
    return { state, base: pending ? pending.base : JSON.stringify(state), pending: !!pending };
  } catch { return null; }
}

// Server data arrives after the first paint. Edits made meanwhile survive:
// untouched fields take the server value, touched fields keep the local one.
export function reconcileServer<T>(base: string, current: T, server: unknown): T {
  return rebaseState(base ? JSON.parse(base) : undefined, current, server);
}
export { PENDING_KEY, STATE_KEY };
