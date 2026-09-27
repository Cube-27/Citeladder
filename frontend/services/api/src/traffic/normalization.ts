import { createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';

import { policy } from '../config.ts';
import { pyCollapseWhitespace, pyCompare } from '../python/text.ts';
import { hostname, urlsplit } from '../python/urlparse.ts';
import casefoldMap from '../generated/query-casefold.json' with { type: 'json' };

const folds: Readonly<Record<string, string>> = casefoldMap;

/** Python `str.casefold`: Unicode default case folding. */
export const casefold = (value: string): string =>
  [...value].map((char) => folds[char] ?? char.toLowerCase()).join('');

/** Unicode default case folding is part of the persisted query identity. */
export function normalizeQuery(value: string): string {
  return pyCollapseWhitespace(casefold(value.normalize('NFKC')));
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Canonical page identity, without fetching or performing URL admission. */
export function canonicalPage(raw: string, origin?: string | null): string | null {
  try {
    let value = raw.trim();
    if (!value) return null;
    if (!urlsplit(value).scheme && origin)
      value = new URL(value, `${origin.replace(/\/+$/u, '')}/`).href;
    const parts = urlsplit(value);
    if (!policy.traffic.url_schemes.includes(parts.scheme) || parts.netloc.includes('@'))
      return null;
    const host = domainToASCII(normalizeQuery((hostname(parts) ?? '').replace(/\.+$/u, '')));
    if (!host) return null;
    const portText = parts.netloc.startsWith('[')
      ? parts.netloc.split(']')[1]?.replace(/^:/u, '')
      : parts.netloc.split(':')[1];
    const defaultPort = parts.scheme === 'https' ? 443 : 80;
    if (portText && !/^\d+$/u.test(portText)) return null;
    const port = portText ? Number(portText) : defaultPort;
    if (!policy.traffic.url_ports.includes(port)) return null;
    const path = (parts.path || '/').replace(/%([0-9a-f]{2})/giu, (_match, hex: string) => {
      const char = String.fromCharCode(Number.parseInt(hex, 16));
      return /[a-z0-9\-._~]/iu.test(char) ? char : `%${hex.toUpperCase()}`;
    });
    const encoded = [...path]
      .map((char) =>
        /[A-Za-z0-9/%:@!$&'()*+,;=~._-]/u.test(char) ? char : encodeURIComponent(char),
      )
      .join('');
    const pairs = [...new URLSearchParams(parts.query)].filter(
      ([key]) => !policy.traffic.ignored_query_keys.includes(key.toLowerCase()),
    );
    pairs.sort(([ak, av], [bk, bv]) => pyCompare(ak, bk) || pyCompare(av, bv));
    const quote = (s: string) =>
      encodeURIComponent(s)
        .replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%20/gu, '+');
    const query = pairs.map(([k, v]) => `${quote(k)}=${quote(v)}`).join('&');
    return `${parts.scheme}://${host}${port === defaultPort ? '' : `:${port}`}${encoded}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
}
