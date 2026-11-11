/**
 * A Shopify storefront's public catalog (`/products.json`), fetched page by
 * page through the shared safe fetcher for a catalog import (CM3). Only the
 * project's own hosts and `*.myshopify.com` stores are fetched, redirects
 * included. No transaction is open while it fetches: the host check reads and
 * commits first, and the pages are stored afterwards as a staged import.
 */
import { z } from 'zod';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { FetchError, fetchWebsite, type WebsiteFetcher } from '../safe-fetch.ts';
import { isOwnedHost, ownedHosts } from './discovery-validation.ts';
import type { CommerceScope } from './reads.ts';

const shopify = policy.commerce.catalog_sources.shopify;
const pageSchema = z.object({ products: z.array(z.unknown()) });

/** The host a person typed as their store: a domain or a URL. */
export function storeHost(value: string): string {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    throw new ApiError(422, 'Enter the store as a domain, like shop.example.com', {
      code: 'commerce_invalid',
    });
  }
}

const hosted = (host: string) =>
  host.endsWith(shopify.hosted_suffix) && host.length > shopify.hosted_suffix.length;

function unavailable(message: string): never {
  throw new ApiError(422, message, { code: 'commerce_store_unavailable' });
}

/**
 * Every page of the store's `products.json`, at most `max_pages`, as the
 * stored payload `catalog-sources.ts` parses; the store host is the one that
 * answered, after redirects.
 */
export async function fetchShopifyStore(
  db: Database,
  scope: CommerceScope,
  store: string,
  fetcher: WebsiteFetcher = fetchWebsite,
): Promise<{ host: string; content: string }> {
  const owned = await ownedHosts(db, scope);
  const allowed = (host: string) => hosted(host) || isOwnedHost(host, owned);
  const requested = storeHost(store);
  if (!allowed(requested))
    throw new ApiError(
      422,
      "Only the project's own domains or a .myshopify.com store can be imported",
      { code: 'commerce_store_not_allowed' },
    );
  const deadline = AbortSignal.timeout(shopify.deadline_seconds * 1000);
  const pages: string[] = [];
  let host = requested;
  let total = 0;
  for (let page = 1; page <= shopify.max_pages; page++) {
    const url = `https://${host}/products.json?limit=${shopify.page_size}&page=${page}`;
    let body: string;
    try {
      const response = await fetcher(url, {
        maxBytes: shopify.page_max_bytes,
        timeoutSeconds: shopify.timeout_seconds,
        redirects: shopify.redirects,
        signal: deadline,
        contentTypes: shopify.content_types,
        authorize: async (next) => {
          if (!allowed(next.hostname.toLowerCase())) throw new FetchError('out_of_scope');
        },
      });
      if (response.status !== 200)
        unavailable(`The store answered HTTP ${response.status} for its product list`);
      host = new URL(response.url).hostname.toLowerCase();
      body = response.body.toString('utf8');
    } catch (error) {
      if (error instanceof ApiError) throw error;
      unavailable(
        error instanceof FetchError
          ? `The store could not be read (${error.code})`
          : 'The store could not be read',
      );
    }
    total += Buffer.byteLength(body, 'utf8');
    if (total > shopify.max_total_bytes) unavailable('The store catalog exceeds the size limit');
    let products: unknown[];
    try {
      products = pageSchema.parse(JSON.parse(body)).products;
    } catch {
      unavailable('The store did not return a Shopify product list');
    }
    pages.push(body);
    if (products.length < shopify.page_size) break;
  }
  return { host, content: JSON.stringify({ store: host, pages }) };
}
