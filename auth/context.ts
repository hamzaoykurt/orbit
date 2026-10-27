import { AsyncLocalStorage } from 'node:async_hooks';

// Only the Worker can establish this context after verifying a server session.
// Never accept an identity supplied by request headers or browser storage.
// `stateRow` is an optimisation: for GET /api/state the gate reads the session
// and the workspace row in ONE D1 round trip. `undefined` = not prefetched.
// `bearer` is true when the session came from an `Authorization: Bearer` app token (native
// client): such requests carry no ambient browser credentials, so cookie-CSRF Origin checks do not apply.
export type AuthenticatedContext = { username: string; stateRow?: unknown; bearer?: boolean };
export const authenticatedRequest = new AsyncLocalStorage<AuthenticatedContext>();
export const authenticatedUser = () => authenticatedRequest.getStore()?.username ?? null;
export const bearerRequest = () => authenticatedRequest.getStore()?.bearer === true;
export const prefetchedStateRow = <T>() => authenticatedRequest.getStore()?.stateRow as T | null | undefined;
export const unauthorized = () => Response.json({ error: 'Devam etmek için giriş yapmalısın.' }, {
  status: 401, headers: { 'Cache-Control': 'private, no-store' },
});
