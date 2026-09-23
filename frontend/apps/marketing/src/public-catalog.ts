import { billingCatalogSchema } from '@/lib/api/schemas/billing';
import { PUBLIC_CATALOG_TIMEOUT_MS } from '@/lib/config/billing';
import { proxyWorkerRequest } from '@/lib/server/worker-origin-proxy';

import type { ApexEnv } from './apex-route';

/** The marketing catalog read has no browser cookies or workspace identity. */
export async function publicCatalog(env: ApexEnv) {
  try {
    const request = new Request(
      `${env.LOCAL_WORKER_ORIGIN === 'true' ? 'http' : 'https'}://${env.PUBLIC_WEBSITE_HOST}/api/v1/billing/catalog`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(PUBLIC_CATALOG_TIMEOUT_MS),
      },
    );
    const response = await proxyWorkerRequest(request, {
      upstream: env.ORIGIN_UPSTREAM,
      originToken: env.ORIGIN_TOKEN,
      publicHost: env.PUBLIC_WEBSITE_HOST,
      allowDevelopmentHttp: env.LOCAL_WORKER_ORIGIN === 'true',
    });
    if (!response.ok) return null;
    const parsed = billingCatalogSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
