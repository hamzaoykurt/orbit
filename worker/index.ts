import app from 'vinext/server/app-router-entry';
import { withAuthentication } from '../auth/gate';

export default {
  fetch(request, env, context) {
    const path = new URL(request.url).pathname;
    // These two machine endpoints authenticate their bounded raw body with both
    // a bearer credential and a timestamped HMAC. They intentionally do not use
    // the browser session gate; every other integration route does.
    if (path === '/api/integrations/profitness/sync' || path === '/api/integrations/profitness/disconnect') {
      return app.fetch(request, env, context);
    }
    return withAuthentication(request, env, () => {
      if (path.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
      return app.fetch(request, env, context);
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
