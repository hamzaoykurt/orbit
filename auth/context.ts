import { AsyncLocalStorage } from 'node:async_hooks';

// Only the Worker can establish this context after verifying a server session.
// Never accept an identity supplied by request headers or browser storage.
export const authenticatedRequest = new AsyncLocalStorage<{ username: string }>();
export const authenticatedUser = () => authenticatedRequest.getStore()?.username ?? null;
export const unauthorized = () => Response.json({ error: 'Devam etmek için giriş yapmalısın.' }, {
  status: 401, headers: { 'Cache-Control': 'private, no-store' },
});
