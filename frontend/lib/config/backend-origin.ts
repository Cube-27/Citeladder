/**
 * Resolve the server-only FastAPI origin shared by frontend runtimes.
 * Browser bundles must never import or expose this module through VITE_* or
 * NEXT_PUBLIC_* values.
 */
const LOOPBACK_HOSTS: Record<string, true> = {
  localhost: true,
  '0.0.0.0': true,
  '::': true,
  '::1': true,
};
const TASK_LOCAL_ORIGIN = 'http://127.0.0.1:8000';

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
    throw new Error('BACKEND_ORIGIN must be an absolute http(s) origin.');
  }
}

function validateOriginShape(parsed: URL): void {
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('BACKEND_ORIGIN must be a credential-free http(s) origin.');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('BACKEND_ORIGIN must not include a path, query, or fragment.');
  }
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS[host] === true || host.startsWith('127.') || isMappedIpv4Literal(host);
}

export function resolveBackendOrigin(
  configuredValue = process.env.BACKEND_ORIGIN,
  production = process.env.NODE_ENV === 'production',
  taskLocal = process.env.CITELADDER_TASK_LOCAL_BACKEND === 'true',
): string {
  const configured = configuredValue?.trim();
  if (!configured) {
    if (production) throw new Error('BACKEND_ORIGIN is required for a production build.');
    return 'http://localhost:8000';
  }

  const parsed = parseOrigin(configured);
  validateOriginShape(parsed);
  const host = stripTrailingDots(parsed.hostname.toLowerCase()).replace(/^\[|\]$/g, '');
  const taskLocalAllowed = taskLocal && parsed.origin === TASK_LOCAL_ORIGIN;
  if (production && isLoopbackHost(host) && !taskLocalAllowed) {
    throw new Error('BACKEND_ORIGIN must not use a loopback host in production.');
  }
  return parsed.origin;
}
