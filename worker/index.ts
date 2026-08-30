import app from 'vinext/server/app-router-entry';
import { withAuthentication } from '../auth/gate';

export default {
  fetch(request, env, context) {
    return withAuthentication(request, env, () => {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
      return app.fetch(request, env, context);
    });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
