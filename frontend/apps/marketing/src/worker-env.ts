import { getSecret } from 'astro:env/server';

import type { ApexEnv } from './apex-route';

/** Astro's Cloudflare adapter reads these values from the Worker bindings. */
export function workerApexEnv(): ApexEnv {
  return {
    ORIGIN_UPSTREAM: getSecret('ORIGIN_UPSTREAM') ?? '',
    ORIGIN_TOKEN: getSecret('ORIGIN_TOKEN') ?? '',
    PUBLIC_WEBSITE_HOST: getSecret('PUBLIC_WEBSITE_HOST') ?? '',
    PUBLIC_APP_ORIGIN: getSecret('PUBLIC_APP_ORIGIN') ?? '',
    LOCAL_WORKER_ORIGIN: getSecret('LOCAL_WORKER_ORIGIN'),
  };
}
