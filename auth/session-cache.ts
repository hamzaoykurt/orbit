import { STATE_SELECT_SQL, WORKSPACE_ID } from '../app/api/state/query';

// Session verification with a short, bounded isolate-local cache.
//
// A request is only trusted when D1 confirmed the session (token hash, credential
// version, expiry) no more than `ttl` seconds ago. The entry is stamped with the
// time the query STARTED, so a revocation that races a lookup is still bounded.
//   - same isolate: logout/login purge the entry at once (forgetSession)
//   - other isolates / other Cloudflare locations: rejected within `ttl` seconds
//   - mutating requests (non-GET/HEAD/OPTIONS) always bypass the cache
// Nothing here is derived from the cookie alone: the cache is filled only after a
// successful D1 lookup, and holds the token HASH (never the token).
export type Session = { token_hash: string; remembered: number; expires_at: number; refreshed_at: number };
export type Lookup = { session: Session | null; stateRow?: unknown; source: 'hit' | 'miss' | 'fresh' };

export const DEFAULT_CACHE_SECONDS = 30;
export const MAX_CACHE_SECONDS = 60;
const MAX_ENTRIES = 16;
type Entry = { session: Session; version: string; checkedAt: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<Lookup>>();
// Bumped on every revocation so a lookup that started before it cannot repopulate the cache.
let epoch = 0;

// 0 disables the cache. Anything unparsable falls back to the default.
export function cacheSeconds(env: unknown) {
  const raw = (env as { ORBIT_SESSION_CACHE_SECONDS?: string }).ORBIT_SESSION_CACHE_SECONDS;
  if (raw === undefined || raw === '') return DEFAULT_CACHE_SECONDS;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(MAX_CACHE_SECONDS, Math.max(0, Math.floor(value))) : DEFAULT_CACHE_SECONDS;
}
export function forgetSession(tokenHash: string | null | undefined) {
  if (!tokenHash) return;
  epoch++;
  entries.delete(tokenHash);
  pending.delete(tokenHash);
  pending.delete(`${tokenHash}:state`);
}
export function updateCachedSession(tokenHash: string, patch: Partial<Session>) {
  const entry = entries.get(tokenHash);
  if (entry) entry.session = { ...entry.session, ...patch };
}
export function clearSessionCache() { epoch++; entries.clear(); pending.clear(); }
function remember(tokenHash: string, entry: Entry) {
  entries.delete(tokenHash);
  entries.set(tokenHash, entry);
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
}

const SESSION_SQL = 'SELECT token_hash, remembered, expires_at, refreshed_at FROM orbit_auth_sessions WHERE token_hash = ? AND credential_version = ? AND expires_at > ?';

async function query(env: Cloudflare.Env, tokenHash: string, version: string, now: number, withState: boolean, ttl: number, cacheable: boolean): Promise<Lookup> {
  const startEpoch = epoch;
  const session = env.DB.prepare(SESSION_SQL).bind(tokenHash, version, now);
  let found: Session | null = null;
  let stateRow: unknown;
  if (withState) {
    try {
      const [first, second] = await env.DB.batch([session, env.DB.prepare(STATE_SELECT_SQL).bind(WORKSPACE_ID)]);
      found = (first.results[0] as Session | undefined) ?? null;
      stateRow = (second.results[0] as unknown) ?? null;
    } catch {
      // A missing/unreadable workspace table must never take authentication down
      // with it: authenticate alone and let the route report its own error.
      found = await env.DB.prepare(SESSION_SQL).bind(tokenHash, version, now).first<Session>();
      stateRow = undefined;
    }
  } else {
    found = await session.first<Session>();
  }
  if (found && cacheable && ttl > 0 && epoch === startEpoch) remember(tokenHash, { session: found, version, checkedAt: now });
  else if (!found) entries.delete(tokenHash);
  return { session: found, stateRow, source: cacheable ? 'miss' : 'fresh' };
}

export async function lookupSession(env: Cloudflare.Env, input: { tokenHash: string; version: string; now: number; fresh: boolean; withState: boolean }): Promise<Lookup> {
  const { tokenHash, version, now, fresh, withState } = input;
  const ttl = cacheSeconds(env);
  const cacheable = !fresh && ttl > 0;
  if (!cacheable) return query(env, tokenHash, version, now, withState, ttl, false).then(result => ({ ...result, source: 'fresh' as const }));
  const hit = entries.get(tokenHash);
  if (hit && hit.version === version && now - hit.checkedAt >= 0 && now - hit.checkedAt < ttl && hit.session.expires_at > now) {
    return { session: { ...hit.session }, source: 'hit' };
  }
  // Concurrent cold requests (a page plus its bundles) share one D1 lookup. A
  // /api/state read only joins a lookup that already carries the workspace row;
  // otherwise it starts its own single batch rather than queue behind a plain one.
  const key = withState ? `${tokenHash}:state` : tokenHash;
  const joined = withState ? pending.get(key) : (pending.get(`${tokenHash}:state`) ?? pending.get(tokenHash));
  if (joined) return { ...(await joined), source: 'miss' };
  const run = query(env, tokenHash, version, now, withState, ttl, true);
  pending.set(key, run);
  const clean = () => { if (pending.get(key) === run) pending.delete(key); };
  run.then(clean, clean);
  return run;
}
