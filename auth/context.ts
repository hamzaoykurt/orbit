import { AsyncLocalStorage } from 'node:async_hooks';

// Only the Worker can establish this context after verifying a server session.
// Never accept an identity supplied by request headers or browser storage.
// `stateRow` is an optimisation: for GET /api/state the gate reads the session
// and the workspace row in ONE D1 round trip. `undefined` = not prefetched.
export type AuthenticatedContext = { username: string; stateRow?: unknown };
export const authenticatedRequest = new AsyncLocalStorage<AuthenticatedContext>();
export const authenticatedUser = () => authenticatedRequest.getStore()?.username ?? null;
export const prefetchedStateRow = <T>() => authenticatedRequest.getStore()?.stateRow as T | null | undefined;
export const unauthorized = () => Response.json({ error: 'Devam etmek için giriş yapmalısın.' }, {
  status: 401, headers: { 'Cache-Control': 'private, no-store' },
});
