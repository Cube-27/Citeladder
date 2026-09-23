import { env } from 'cloudflare:workers';

import type { ApexEnv } from './apex-route';

/** Read the request's Worker bindings directly from Cloudflare's runtime. */
export function workerApexEnv(): ApexEnv {
  return {
    ORIGIN_UPSTREAM: env.ORIGIN_UPSTREAM,
    ORIGIN_TOKEN: env.ORIGIN_TOKEN,
    PUBLIC_WEBSITE_HOST: env.PUBLIC_WEBSITE_HOST,
    PUBLIC_APP_ORIGIN: env.PUBLIC_APP_ORIGIN,
    LOCAL_WORKER_ORIGIN: env.LOCAL_WORKER_ORIGIN,
  };
}
