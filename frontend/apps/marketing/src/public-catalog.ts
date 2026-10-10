import { billingCatalogSchema } from '@citeladder/contracts/billing';
import type { BillingCatalog } from '@/lib/api/billing';
import {
  PUBLIC_CATALOG_FRESH_SECONDS,
  PUBLIC_CATALOG_STALE_SECONDS,
  PUBLIC_CATALOG_TIMEOUT_MS,
} from '@/lib/config/billing';
import { proxyWorkerRequest } from '@/lib/server/worker-origin-proxy';

import type { ApexEnv } from './apex-route';

/** The part of the Workers Cache API the catalog read uses. */
export type CatalogCache = Pick<Cache, 'match' | 'put'>;

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

function cacheKey(tier: 'fresh' | 'stale', country: string | undefined): string {
  return `https://public-catalog.invalid/${tier}/${country ?? 'default'}`;
}

async function cachedCatalog(cache: CatalogCache, key: string): Promise<BillingCatalog | null> {
  const hit = await cache.match(key);
  if (!hit) return null;
  const parsed = billingCatalogSchema.safeParse(await hit.json());
  return parsed.success ? parsed.data : null;
}

/** The marketing catalog read has no browser cookies or workspace identity. */
async function originCatalog(env: ApexEnv, country?: string): Promise<BillingCatalog | null> {
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

/**
 * The public catalog for a display country. A recent copy is served from the
 * edge cache so page views do not wake the API; when the API cannot answer, the
 * last good copy stands in until it expires.
 */
export async function publicCatalog(
  env: ApexEnv,
  country: string | undefined,
  cache: CatalogCache,
): Promise<BillingCatalog | null> {
  const fresh = await cachedCatalog(cache, cacheKey('fresh', country));
  if (fresh) return fresh;
  const catalog = await originCatalog(env, country);
  if (!catalog) return cachedCatalog(cache, cacheKey('stale', country));
  const body = JSON.stringify(catalog);
  const store = (tier: 'fresh' | 'stale', seconds: number) =>
    cache.put(
      cacheKey(tier, country),
      new Response(body, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${seconds}` },
      }),
    );
  await Promise.all([
    store('fresh', PUBLIC_CATALOG_FRESH_SECONDS),
    store('stale', PUBLIC_CATALOG_STALE_SECONDS),
  ]);
  return catalog;
}
