import { handle } from '@astrojs/cloudflare/handler';

import { isApiHostRequest, routeApiHostRequest } from './api-host-route';

type AstroArgs = Parameters<typeof handle>;
type MarketingEnv = AstroArgs[1] & { LOCAL_WORKER_ORIGIN?: string };

/**
 * Worker entry for both custom domains. Assets run behind the Worker
 * (`run_worker_first`), so the API host is answered here before Astro or the
 * assets binding can serve a marketing page on it; the marketing host goes to
 * Astro, which serves prerendered files through `env.ASSETS.fetch`.
 */
const marketingWorker = {
  async fetch(request: Request, env: MarketingEnv, context: AstroArgs[2]) {
    const api = {
      ORIGIN_UPSTREAM: env.ORIGIN_UPSTREAM,
      ORIGIN_TOKEN: env.ORIGIN_TOKEN,
      PUBLIC_API_HOST: env.PUBLIC_API_HOST,
      LOCAL_WORKER_ORIGIN: env.LOCAL_WORKER_ORIGIN,
    };
    if (isApiHostRequest(request, api)) return routeApiHostRequest(request, api);
    return handle(request, env, context);
  },
};

export default marketingWorker;
