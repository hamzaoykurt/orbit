type StartupPayload = { state?: unknown } | null;
declare global {
  interface Window { __orbitStartupState?: Promise<StartupPayload> }
}

// Start the private data request while the browser is still downloading React.
// This is a per-document promise, not a persistent or shared response cache.
export const startupScript = `(function(){if(!window.__orbitStartupState){window.__orbitStartupState=fetch('/api/state',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}})();`;

export async function readStartupState(): Promise<StartupPayload> {
  const pending = window.__orbitStartupState;
  if (pending) {
    try { return await pending; }
    finally { if (window.__orbitStartupState === pending) delete window.__orbitStartupState; }
  }
  const response = await fetch('/api/state', { cache: 'no-store' });
  if (!response.ok) throw new Error('State request failed');
  return response.json() as Promise<StartupPayload>;
}
