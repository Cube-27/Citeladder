import { billingCatalogSchema } from '@citeladder/contracts/billing';
import type { BillingCatalog } from '@/lib/api/billing';
import {
  PUBLIC_CATALOG_FRESH_SECONDS,
  PUBLIC_CATALOG_STALE_SECONDS,
  PUBLIC_CATALOG_TIMEOUT_MS,
} from '@/lib/config/billing';
import { proxyWorkerRequest } from '@/lib/server/worker-origin-proxy';

import type { ApexEnv } from './apex-route';

export type CatalogCache = Pick<Cache, 'match' | 'put'>;

export function displayCountry(headers: Headers): string | undefined {
  const country = headers.get('cf-ipcountry')?.trim().toUpperCase() ?? '';
  return /^[A-Z]{2}$/.test(country) && country !== 'XX' && country !== 'T1' ? country : undefined;
}

const FETCHED_AT_HEADER = 'X-Catalog-Fetched-At';

function cacheKey(country: string | undefined): string {
  return `https://public-catalog.invalid/${country ?? 'default'}`;
}

async function cachedCatalog(
  cache: CatalogCache,
  key: string,
): Promise<{ catalog: BillingCatalog; fetchedAt: number } | null> {
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const fetchedAt = Number(hit.headers.get(FETCHED_AT_HEADER));
    const parsed = billingCatalogSchema.safeParse(await hit.json());
    return parsed.success && Number.isFinite(fetchedAt)
      ? { catalog: parsed.data, fetchedAt }
      : null;
  } catch {
    return null;
  }
}

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

export async function publicCatalog(
  env: ApexEnv,
  country: string | undefined,
  edge: { cache: CatalogCache; waitUntil: (work: Promise<unknown>) => void },
): Promise<BillingCatalog | null> {
  const key = cacheKey(country);
  const cached = await cachedCatalog(edge.cache, key);
  if (cached && Date.now() - cached.fetchedAt < PUBLIC_CATALOG_FRESH_SECONDS * 1000) {
    return cached.catalog;
  }
  const catalog = await originCatalog(env, country);
  if (!catalog) return cached?.catalog ?? null;
  edge.waitUntil(
    edge.cache
      .put(
        key,
        new Response(JSON.stringify(catalog), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${PUBLIC_CATALOG_STALE_SECONDS}`,
            [FETCHED_AT_HEADER]: String(Date.now()),
          },
        }),
      )
      .catch(() => undefined),
  );
  return catalog;
}
