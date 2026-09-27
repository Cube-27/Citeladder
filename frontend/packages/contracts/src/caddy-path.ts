/**
 * Caddy's `path` matcher, shared by every consumer that must route a request
 * path the way the production ingress does (the route-ownership gate and the
 * Vite dev proxy), so they cannot drift apart.
 *
 * Caddy checks a pattern's shape in this order, comparing case-insensitively:
 *
 * - `*` alone matches every path;
 * - `*inner*` is a substring match on the literal `inner`;
 * - `*suffix` is a suffix match on the literal `suffix`;
 * - `prefix*` is a prefix match on the literal `prefix`, so it crosses `/`;
 * - anything else is Go's `path.Match`, where `*` stays inside one segment.
 *
 * The shape checks run first, so a `*` inside a prefix, suffix or substring
 * pattern is a literal character there, exactly as in Caddy. Patterns using
 * `path.Match`'s other metacharacters (`?`, `[`, `\`) are refused rather than
 * approximated.
 */

const UNSUPPORTED = /[?[\\]/u;

function literal(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
}

/**
 * The regular-expression source for one Caddy path pattern. It matches a
 * request path with or without its query string, so it also serves as a
 * Vite proxy key; compile it with the `i` flag for Caddy's case folding.
 */
export function caddyPathSource(pattern: string): string {
  if (UNSUPPORTED.test(pattern)) {
    throw new Error(`Unsupported Caddy path pattern '${pattern}'`);
  }
  if (pattern === '*') return '^';
  const end = '(?:\\?|$)';
  if (pattern.length > 1 && pattern.startsWith('*') && pattern.endsWith('*')) {
    return `^[^?]*${literal(pattern.slice(1, -1))}`;
  }
  if (pattern.startsWith('*')) return `^[^?]*${literal(pattern.slice(1))}${end}`;
  if (pattern.endsWith('*')) return `^${literal(pattern.slice(0, -1))}`;
  return `^${pattern.split('*').map(literal).join('[^/?]*')}${end}`;
}

/** Whether Caddy's `path` matcher accepts `path` for `pattern`. */
export function caddyPathMatches(pattern: string, path: string): boolean {
  return new RegExp(caddyPathSource(pattern), 'iu').test(path);
}
