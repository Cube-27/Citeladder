/**
 * Resolve the server-only API origin shared by frontend runtimes.
 * Browser bundles must never import or expose this module through VITE_* or
 * NEXT_PUBLIC_* values.
 */
const LOOPBACK_HOSTS: Record<string, true> = {
  localhost: true,
  '0.0.0.0': true,
  '::': true,
  '::1': true,
};
const TASK_LOCAL_ORIGIN = 'http://127.0.0.1:8100';

function isMappedIpv4Literal(host: string): boolean {
  if (!host.includes(':')) return false;
  const segments = host.split(':');
  const marker = segments.indexOf('ffff');
  if (marker < 0) return false;
  return segments.slice(0, marker).every((segment) => segment === '' || /^0+$/.test(segment));
}

function stripTrailingDots(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 46) end -= 1;
  return value.slice(0, end);
}

function parseOrigin(configured: string): URL {
  try {
    return new URL(configured);
  } catch {
    throw new Error('API_SERVICE_ORIGIN must be an absolute http(s) origin.');
  }
}

function validateOriginShape(parsed: URL): void {
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('API_SERVICE_ORIGIN must be a credential-free http(s) origin.');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('API_SERVICE_ORIGIN must not include a path, query, or fragment.');
  }
}

function isLoopbackHost(host: string): boolean {
  // URL parsing canonicalizes alternate IPv4 spellings before this check.
  const linkLocalV6 =
    host.includes(':') && (Number.parseInt(host.split(':')[0]!, 16) & 0xffc0) === 0xfe80;
  return (
    LOOPBACK_HOSTS[host] === true ||
    (host.startsWith('0.') && /^[\d.]+$/u.test(host)) ||
    host.startsWith('127.') ||
    host.startsWith('169.254.') ||
    linkLocalV6 ||
    isMappedIpv4Literal(host)
  );
}

export function resolveApiServiceOrigin(
  configuredValue = process.env.API_SERVICE_ORIGIN,
  production = process.env.NODE_ENV === 'production',
  taskLocal = process.env.CITELADDER_TASK_LOCAL_API === 'true',
): string {
  const configured = configuredValue?.trim();
  if (!configured) {
    if (production) throw new Error('API_SERVICE_ORIGIN is required for a production build.');
    return 'http://localhost:8100';
  }

  const parsed = parseOrigin(configured);
  validateOriginShape(parsed);
  const host = stripTrailingDots(parsed.hostname.toLowerCase()).replace(/^\[|\]$/g, '');
  const taskLocalAllowed = taskLocal && parsed.origin === TASK_LOCAL_ORIGIN;
  if (production && isLoopbackHost(host) && !taskLocalAllowed) {
    throw new Error('API_SERVICE_ORIGIN must not use a loopback host in production.');
  }
  return parsed.origin;
}
