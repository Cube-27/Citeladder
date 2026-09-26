/**
 * `urllib.parse.urlsplit`/`urlparse` and `.hostname`, as Python 3.12 has them.
 *
 * The WHATWG `URL` parser rejects, punycodes and normalizes inputs Python
 * accepts verbatim, and citation domains are classified by what Python
 * extracts. Where Python raises `ValueError` this throws `PythonValueError`,
 * so a caller that catches it in Python catches it here too.
 */
export class PythonValueError extends Error {}

export type SplitResult = {
  scheme: string;
  netloc: string;
  path: string;
  query: string;
  fragment: string;
};

const SCHEME_CHARS = /^[a-z0-9+\-.]+$/iu;
const USES_PARAMS = new Set([
  '',
  'ftp',
  'hdl',
  'prospero',
  'http',
  'imap',
  'https',
  'shttp',
  'rtsp',
  'rtsps',
  'rtspu',
  'sip',
  'sips',
  'mms',
  'sftp',
  'tel',
]);

function splitNetloc(url: string): [string, string] {
  let end = url.length;
  for (const delimiter of '/?#') {
    const found = url.indexOf(delimiter, 2);
    if (found >= 0) end = Math.min(end, found);
  }
  return [url.slice(2, end), url.slice(end)];
}

function isIpv4(text: string): boolean {
  const parts = text.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255 && !/^0\d/u.test(part))
  );
}

/** `ipaddress.IPv6Address(text)` accepts it (scope id included). */
function isIpv6(text: string): boolean {
  const [address = '', ...scope] = text.split('%');
  if (scope.length > 1 || (scope.length === 1 && !scope[0])) return false;
  let groups = address.split(':');
  let expected = 8;
  const last = groups.at(-1) ?? '';
  if (last.includes('.')) {
    if (!isIpv4(last)) return false;
    groups = groups.slice(0, -1);
    expected = 6;
  }
  const hex = /^[0-9a-f]{1,4}$/iu;
  const doubled = address.indexOf('::');
  if (doubled >= 0) {
    if (address.indexOf('::', doubled + 1) >= 0) return false;
    const [head = '', tail = ''] = address.split('::');
    const headGroups = head ? head.split(':') : [];
    const tailGroups = (tail ? tail.split(':') : []).slice(0, expected === 6 ? -1 : undefined);
    const explicit = [...headGroups, ...tailGroups];
    return explicit.length < expected && explicit.every((group) => hex.test(group));
  }
  return groups.length === expected && groups.every((group) => hex.test(group));
}

function checkBracketedHost(host: string): void {
  if (host.startsWith('v')) {
    if (!/^v[a-f0-9]+\..+$/isu.test(host))
      throw new PythonValueError('IPvFuture address is invalid');
    return;
  }
  if (isIpv4(host)) throw new PythonValueError('An IPv4 address cannot be in brackets');
  if (!isIpv6(host))
    throw new PythonValueError(`'${host}' does not appear to be an IPv4 or IPv6 address`);
}

function isAscii(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

/** `url.lstrip()` of the WHATWG C0 control-or-space set. */
function stripLeadingC0(url: string): string {
  let start = 0;
  while (start < url.length && url.charCodeAt(start) <= 0x20) start += 1;
  return url.slice(start);
}

function checkNetloc(netloc: string): void {
  if (!netloc || isAscii(netloc)) return;
  const stripped = netloc.replace(/[@:#?]/gu, '');
  const normalized = stripped.normalize('NFKC');
  if (stripped === normalized) return;
  if (/[/?#@:]/u.test(normalized)) {
    throw new PythonValueError(
      `netloc '${netloc}' contains invalid characters under NFKC normalization`,
    );
  }
}

/** `urllib.parse.urlsplit(url)` with the default arguments. */
export function urlsplit(input: string): SplitResult {
  let url = stripLeadingC0(input).replace(/[\t\r\n]/gu, '');
  let scheme = '';
  let netloc = '';
  let query = '';
  let fragment = '';
  const colon = url.indexOf(':');
  if (colon > 0 && /^[a-z]$/iu.test(url[0]!) && SCHEME_CHARS.test(url.slice(0, colon))) {
    scheme = url.slice(0, colon).toLowerCase();
    url = url.slice(colon + 1);
  }
  if (url.startsWith('//')) {
    [netloc, url] = splitNetloc(url);
    if (netloc.includes('[') !== netloc.includes(']')) {
      throw new PythonValueError('Invalid IPv6 URL');
    }
    if (netloc.includes('[') && netloc.includes(']')) {
      checkBracketedHost(netloc.slice(netloc.indexOf('[') + 1).split(']')[0]!);
    }
  }
  const hash = url.indexOf('#');
  if (hash >= 0) [url, fragment] = [url.slice(0, hash), url.slice(hash + 1)];
  const question = url.indexOf('?');
  if (question >= 0) [url, query] = [url.slice(0, question), url.slice(question + 1)];
  checkNetloc(netloc);
  return { scheme, netloc, path: url, query, fragment };
}

/** `urlparse(url).path`: `urlsplit`'s path without its last segment's `;params`. */
export function urlparsePath(parts: SplitResult): string {
  if (!USES_PARAMS.has(parts.scheme) || !parts.path.includes(';')) return parts.path;
  const semicolon = parts.path.includes('/')
    ? parts.path.indexOf(';', parts.path.lastIndexOf('/'))
    : parts.path.indexOf(';');
  return semicolon < 0 ? parts.path : parts.path.slice(0, semicolon);
}

/** `SplitResult.hostname`: lowercased host, zone id kept, or null. */
export function hostname(parts: SplitResult): string | null {
  const at = parts.netloc.lastIndexOf('@');
  const hostinfo = at >= 0 ? parts.netloc.slice(at + 1) : parts.netloc;
  const open = hostinfo.indexOf('[');
  let host: string;
  if (open >= 0) {
    const bracketed = hostinfo.slice(open + 1);
    const close = bracketed.indexOf(']');
    host = close >= 0 ? bracketed.slice(0, close) : bracketed;
  } else {
    const colon = hostinfo.indexOf(':');
    host = colon >= 0 ? hostinfo.slice(0, colon) : hostinfo;
  }
  if (!host) return null;
  const percent = host.indexOf('%');
  return percent >= 0
    ? host.slice(0, percent).toLowerCase() + host.slice(percent)
    : host.toLowerCase();
}
