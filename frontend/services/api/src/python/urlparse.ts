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

/** `SplitResult.port`: the port number, null when absent; throws when malformed. */
export function port(parts: SplitResult): number | null {
  const at = parts.netloc.lastIndexOf('@');
  const hostinfo = at >= 0 ? parts.netloc.slice(at + 1) : parts.netloc;
  const open = hostinfo.indexOf('[');
  let raw: string;
  if (open >= 0) {
    const bracketed = hostinfo.slice(open + 1);
    const close = bracketed.indexOf(']');
    const after = close >= 0 ? bracketed.slice(close + 1) : '';
    const colon = after.indexOf(':');
    raw = colon >= 0 ? after.slice(colon + 1) : '';
  } else {
    const colon = hostinfo.indexOf(':');
    raw = colon >= 0 ? hostinfo.slice(colon + 1) : '';
  }
  if (!raw) return null;
  if (!/^[0-9]+$/u.test(raw)) {
    throw new PythonValueError(`Port could not be cast to integer value as '${raw}'`);
  }
  const value = Number(raw);
  if (value > 65_535) throw new PythonValueError('Port out of range 0-65535');
  return value;
}

const USES_NETLOC = new Set([
  '',
  'ftp',
  'http',
  'gopher',
  'nntp',
  'telnet',
  'imap',
  'wais',
  'file',
  'mms',
  'https',
  'shttp',
  'snews',
  'prospero',
  'rtsp',
  'rtsps',
  'rtspu',
  'rsync',
  'svn',
  'svn+ssh',
  'sftp',
  'nfs',
  'git',
  'git+ssh',
  'ws',
  'wss',
  'itms-services',
]);

/** `urllib.parse.urlunsplit`. */
export function urlunsplit(parts: SplitResult): string {
  let url = parts.path;
  if (parts.netloc) {
    if (url && !url.startsWith('/')) url = `/${url}`;
    url = `//${parts.netloc}${url}`;
  } else if (url.startsWith('//')) {
    url = `//${url}`;
  } else if (parts.scheme && USES_NETLOC.has(parts.scheme) && (!url || url.startsWith('/'))) {
    url = `//${url}`;
  }
  if (parts.scheme) url = `${parts.scheme}:${url}`;
  if (parts.query) url = `${url}?${parts.query}`;
  if (parts.fragment) url = `${url}#${parts.fragment}`;
  return url;
}

const utf8 = new TextEncoder();

/** `unquote(text)`: percent escapes in ASCII runs decode as UTF-8, invalid bytes as U+FFFD. */
function unquote(text: string): string {
  if (!text.includes('%')) return text;
  let decoded = '';
  let bytes: number[] = [];
  const flush = () => {
    decoded += new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    bytes = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const hex = text.slice(index + 1, index + 3);
    if (code >= 0x80) {
      // A non-ASCII character passes through and ends the byte run.
      flush();
      decoded += text[index];
    } else if (text[index] === '%' && /^[0-9a-f]{2}$/iu.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(code);
    }
  }
  flush();
  return decoded;
}

/** `parse_qsl(query, keep_blank_values=True)`. */
export function parseQsl(query: string): [string, string][] {
  const pairs: [string, string][] = [];
  for (const field of query.split('&')) {
    if (!field) continue;
    const equals = field.indexOf('=');
    const [name, value] =
      equals >= 0 ? [field.slice(0, equals), field.slice(equals + 1)] : [field, ''];
    pairs.push([unquote(name.replaceAll('+', ' ')), unquote(value.replaceAll('+', ' '))]);
  }
  return pairs;
}

const ALWAYS_SAFE = /^[A-Za-z0-9_.~-]$/u;

/** `quote_plus(text)` with no extra safe characters. */
function quotePlus(text: string): string {
  let quoted = '';
  for (const byte of utf8.encode(text)) {
    const character = String.fromCharCode(byte);
    if (byte === 0x20) quoted += '+';
    else if (ALWAYS_SAFE.test(character)) quoted += character;
    else quoted += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return quoted;
}

/** `urlencode(pairs)`. */
export function urlencode(pairs: readonly (readonly [string, string])[]): string {
  return pairs.map(([name, value]) => `${quotePlus(name)}=${quotePlus(value)}`).join('&');
}
