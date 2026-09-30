/** Durable operator suppression, destination robots, and publisher pacing at every hop. */
import { setTimeout as delay } from 'node:timers/promises';
import robotsModule from 'robots-parser';

import { policy, resolveSettingSpec } from '../config.ts';
import type { Database } from '../db/database.ts';
import {
  FetchError,
  fetchWebsite,
  type FetchOptions,
  type WebsiteFetcher,
} from '../projects/safe-fetch.ts';

// The package is CommonJS; its declaration describes the exported function as ESM.
const robotsParser = robotsModule as unknown as (
  url: string,
  body: string,
) => {
  isAllowed: (url: string, userAgent: string) => boolean | undefined;
  getCrawlDelay: (userAgent: string) => number | undefined;
  getSitemaps: () => string[];
};

export function acquisitionSettings(env: Record<string, string | undefined> = process.env) {
  const spec = policy.site_health.settings;
  const number = (key: keyof typeof spec) => Number(resolveSettingSpec(spec[key], env));
  return {
    defaultDelay: number('default_crawl_delay_seconds'),
    maxDelay: number('max_crawl_delay_seconds'),
    robotsBytes: number('robots_max_decoded_bytes'),
    robotsTtl: number('robots_cache_ttl_seconds'),
    robotsRetry: number('robots_unreachable_recheck_seconds'),
    robotsAuthorities: number('robots_cache_max_authorities'),
    timeout: number('request_timeout_seconds'),
    redirects: number('max_redirects'),
  };
}
export async function authorizeAcquisition(db: Database, url: URL) {
  const labels = url.hostname.toLowerCase().replace(/\.$/u, '').split('.');
  const scopes = [
    '*',
    ...labels.slice(0, -1).map((_label, index) => labels.slice(index).join('.')),
  ];
  try {
    const blocked = await db
      .selectFrom('web_acquisition_controls')
      .select('domain')
      .where('domain', 'in', scopes)
      .where('blocked', '=', true)
      .limit(1)
      .executeTakeFirst();
    if (blocked) throw new FetchError('acquisition_unavailable');
  } catch {
    throw new FetchError('acquisition_unavailable');
  }
}
export class HostPacer {
  readonly pending = new Map<string, Promise<void>>();
  readonly last = new Map<string, number>();
  async slot<T>(authority: string, seconds: number, send: () => Promise<T>, signal?: AbortSignal) {
    const previous = this.pending.get(authority) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.pending.set(authority, queued);
    await previous;
    try {
      signal?.throwIfAborted();
      const wait = Math.max(
        0,
        seconds * 1000 - (performance.now() - (this.last.get(authority) ?? -Infinity)),
      );
      if (wait) await delay(wait, undefined, { signal });
      return await send();
    } finally {
      this.last.set(authority, performance.now());
      release();
      if (this.pending.get(authority) === queued) this.pending.delete(authority);
    }
  }
}
export function robotsPolicy(
  origin: string,
  status: number,
  body: string,
  settings = acquisitionSettings({}),
) {
  const unavailable = status === 429 || status >= 500 || status === 0;
  const restricted = status === 401 || status === 403;
  const robots = robotsParser(`${origin}/robots.txt`, status === 200 ? body : '');
  const declared = robots.getCrawlDelay(policy.web_fetch.user_agent);
  const seconds = declared === undefined ? settings.defaultDelay : Math.max(0, declared);
  return {
    unavailable,
    restricted,
    delay: seconds,
    sitemaps: robots.getSitemaps(),
    permits: (url: string) =>
      !unavailable &&
      !restricted &&
      Number.isFinite(seconds) &&
      seconds <= settings.maxDelay &&
      robots.isAllowed(url, policy.web_fetch.user_agent) === true,
  };
}
type RobotsPolicy = ReturnType<typeof robotsPolicy>;

export class PageAcquirer {
  readonly #cache = new Map<string, { expires: number; value: Promise<RobotsPolicy> }>();
  readonly #pacer = new HostPacer();
  readonly authorize: (url: URL) => Promise<void>;
  readonly fetcher: WebsiteFetcher;
  readonly settings: ReturnType<typeof acquisitionSettings>;
  readonly floor: number;
  constructor(
    authorize: (url: URL) => Promise<void>,
    fetcher: WebsiteFetcher = fetchWebsite,
    settings = acquisitionSettings(),
    floor = policy.source_pages.per_host_delay_seconds,
  ) {
    this.authorize = authorize;
    this.fetcher = fetcher;
    this.settings = settings;
    this.floor = floor;
  }
  async robots(origin: string): Promise<RobotsPolicy> {
    const cached = this.#cache.get(origin);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = this.#robots(origin);
    this.#cache.set(origin, { expires: Date.now() + this.settings.robotsTtl * 1000, value });
    if (this.settings.robotsAuthorities && this.#cache.size > this.settings.robotsAuthorities) {
      for (const key of this.#cache.keys()) {
        if (key !== origin) {
          this.#cache.delete(key);
          break;
        }
      }
    }
    const result = await value;
    if (result.unavailable)
      this.#cache.set(origin, { value, expires: Date.now() + this.settings.robotsRetry * 1000 });
    return result;
  }
  async #robots(origin: string) {
    try {
      const result = await this.fetcher(`${origin}/robots.txt`, {
        maxBytes: this.settings.robotsBytes,
        timeoutSeconds: this.settings.timeout,
        redirects: this.settings.redirects,
        contentTypes: ['text/plain', 'text/html', 'application/octet-stream', ''],
        authorize: this.authorize,
        gate: (url, send, signal) => this.#pacer.slot(url.origin, this.floor, send, signal),
      });
      return robotsPolicy(origin, result.status, result.body.toString('utf8'), this.settings);
    } catch {
      return robotsPolicy(origin, 0, '', this.settings);
    }
  }
  fetch(url: string, options: Omit<FetchOptions, 'gate' | 'authorize'>) {
    return this.fetcher(url, {
      ...options,
      authorize: this.authorize,
      gate: async (destination, send, signal) => {
        const robots = await this.robots(destination.origin);
        if (!robots.permits(destination.href))
          throw new FetchError(robots.unavailable ? 'robots_unavailable' : 'robots_disallowed');
        return this.#pacer.slot(
          destination.origin,
          Math.max(this.floor, robots.delay),
          send,
          signal,
        );
      },
    });
  }
}
