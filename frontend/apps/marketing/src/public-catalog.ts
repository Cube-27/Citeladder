import { billingCatalogSchema } from '@/lib/api/schemas/billing';
import { PUBLIC_CATALOG_TIMEOUT_MS } from '@/lib/config/billing';
import { proxyWorkerRequest } from '@/lib/server/worker-origin-proxy';

import type { ApexEnv } from './apex-route';

/**
 * The visitor's country from Cloudflare's edge geolocation, for DISPLAY only.
 *
 * It picks which currency the public page shows. It is never a billing fact:
 * the server quote, resolved from the billing details entered at checkout,
 * decides currency and tax. Cloudflare's `XX` (unknown) and `T1` (Tor) are
 * not countries, so they fall back to the default display region.
 */
export function displayCountry(headers: Headers): string | undefined {
  const country = headers.get('cf-ipcountry')?.trim().toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : undefined;
}

/** The marketing catalog read has no browser cookies or workspace identity. */
export async function publicCatalog(env: ApexEnv, country?: string) {
  try {
    const query = country ? `?country=${encodeURIComponent(country)}` : '';
    const request = new Request(
      `${env.LOCAL_WORKER_ORIGIN === 'true' ? 'http' : 'https'}://${env.PUBLIC_WEBSITE_HOST}/api/v1/billing/catalog${query}`,
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
