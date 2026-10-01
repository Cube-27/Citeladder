/** URL evidence uses the same config-owned catalog for owned and external pages. */
import { policy } from '../config.ts';
import { stripTrailing } from '../text-order.ts';

const MAX_PATH_CHARS = policy.site_health.page_analysis.facts.limits.path_chars;
const slugPatterns = policy.site_health.slug_patterns.map(
  ([kind, pattern]) => [kind!, new RegExp(pattern!)] as const,
);
const routePatterns = policy.site_health.route_patterns.map(
  ([kind, pattern]) => [kind!, new RegExp(pattern!, 'd')] as const,
);

/** The lower-cased path without trailing slashes; the root is `''`. */
export const normalizedPath = (url: URL) =>
  stripTrailing(url.pathname.slice(0, MAX_PATH_CHARS).toLowerCase(), '/');

/** An absolute http(s) URL with a host, or null: only those have a path to reason about. */
export function documentUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return policy.web_fetch.schemes.includes(url.protocol.slice(0, -1)) && url.hostname ? url : null;
}

/**
 * The route a path names: a shape inside the slug (`/blog/a-vs-b`) wins over
 * the semantic segment nearest the root; config order breaks ties.
 */
export function routeSignal(path: string): { kind: string; pattern: string } | null {
  const slug = path
    .replaceAll(/[/_+.]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replaceAll(/-{2,}/gu, '-');
  if (slug)
    for (const [kind, pattern] of slugPatterns)
      if (pattern.test(slug)) return { kind, pattern: pattern.source };
  let best: { kind: string; pattern: string; position: number } | null = null;
  for (const [kind, pattern] of routePatterns) {
    const position = pattern.exec(path)?.indices?.[1]?.[0];
    if (position !== undefined && (!best || position < best.position))
      best = { kind, pattern: pattern.source, position };
  }
  return best && { kind: best.kind, pattern: best.pattern };
}

export function routePageKind(value: string): string | null {
  const url = documentUrl(value);
  if (!url) return null;
  const path = normalizedPath(url);
  if (policy.site_health.homepage_paths.includes(path)) return 'homepage';
  return routeSignal(path)?.kind ?? null;
}
