/**
 * Caddy's `path` matcher, shared by every consumer that must route a request
 * path the way the production ingress does (the route-ownership gate and the
 * Vite dev proxy), so they cannot drift apart.
 *
 * Caddy compares case-insensitively, against the request path cleaned as
 * `path.Clean` does (keeping a trailing slash, and merging repeated slashes
 * unless the pattern itself contains `//`). It then picks a strategy by the
 * pattern's wildcards:
 *
 * - `*` alone matches every path;
 * - `*inner*` (exactly two wildcards) is a substring match on `inner`;
 * - `*suffix` (exactly one) is a suffix match on `suffix`;
 * - `prefix*` (exactly one) is a prefix match on `prefix`, so it crosses `/`;
 * - anything else is Go's `path.Match`, where `*` stays inside one segment.
 *
 * Patterns using `path.Match`'s other metacharacters (`?`, `[`, `\`) are
 * refused rather than approximated.
 */

const UNSUPPORTED = /[?[\\]/u;
// Stands in for the empty segment between two slashes while cleaning, as
// Caddy's `CleanPath` does with an impossible byte.
const EMPTY_SEGMENT = '￿';

function literal(text: string, proxyKey: boolean): string {
  const escaped = text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
  if (!proxyKey) return escaped;
  // A proxy key sees the raw URL, so it folds case and accepts the repeated
  // slashes Caddy's cleaning merges (a browser already resolves `.` and `..`).
  return escaped
    .replaceAll(/[a-z]/giu, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`)
    .replaceAll('\\/', '\\/+');
}

/** Go's `path.Clean`. */
function goPathClean(path: string): string {
  if (path === '') return '.';
  const rooted = path.startsWith('/');
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment !== '..') segments.push(segment);
    else if (segments.length > 0 && segments.at(-1) !== '..') segments.pop();
    else if (!rooted) segments.push('..');
  }
  const cleaned = (rooted ? '/' : '') + segments.join('/');
  return cleaned === '' ? '.' : cleaned;
}

/** Caddy's `CleanPath`: `path.Clean` that keeps a trailing slash. */
function caddyCleanPath(path: string, mergeSlashes: boolean): string {
  const expanded = mergeSlashes ? path : path.replaceAll(/(?<=\/)(?=\/)/gu, EMPTY_SEGMENT);
  let cleaned = goPathClean(expanded);
  if (cleaned !== '/' && expanded.endsWith('/')) cleaned += '/';
  return cleaned.replaceAll(EMPTY_SEGMENT, '');
}

/**
 * The regular-expression source for one Caddy path pattern. It matches a
 * request path with or without its query string, so it also serves as a
 * Vite proxy key. Compile it with the `i` flag for Caddy's case folding over
 * a cleaned path, or pass `proxyKey` for a source that folds case and merges
 * slashes by itself (Vite compiles proxy keys without flags or cleaning).
 */
export function caddyPathSource(pattern: string, { proxyKey = false } = {}): string {
  if (UNSUPPORTED.test(pattern)) {
    throw new Error(`Unsupported Caddy path pattern '${pattern}'`);
  }
  if (pattern === '*') return '^';
  const text = (value: string) => literal(value, proxyKey);
  const end = '(?:\\?|$)';
  const wildcards = pattern.split('*').length - 1;
  if (wildcards === 2 && pattern.startsWith('*') && pattern.endsWith('*')) {
    return `^[^?]*${text(pattern.slice(1, -1))}`;
  }
  if (wildcards === 1 && pattern.startsWith('*')) {
    return `^[^?]*${text(pattern.slice(1))}${end}`;
  }
  if (wildcards === 1 && pattern.endsWith('*')) return `^${text(pattern.slice(0, -1))}`;
  return `^${pattern.split('*').map(text).join('[^/?]*')}${end}`;
}

/** Whether Caddy's `path` matcher accepts the request `path` for `pattern`. */
export function caddyPathMatches(pattern: string, path: string): boolean {
  const target = caddyCleanPath(path, !pattern.includes('//'));
  return new RegExp(caddyPathSource(pattern), 'iu').test(target);
}
