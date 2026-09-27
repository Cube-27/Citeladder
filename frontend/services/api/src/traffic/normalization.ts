import { createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';

import { policy } from '../config.ts';
import { compareIdentityText } from '../analysis/comparison.ts';

import casefoldMap from '../generated/query-casefold.json' with { type: 'json' };

const folds: Readonly<Record<string, string>> = casefoldMap;

/** Unicode folding retained for prompt hashes shared with the Python writer. */
export const casefold = (value: string): string =>
  [...value].map((char) => folds[char] ?? char.toLowerCase()).join('');

/** Whitespace in shared prompt/query identities, until their Python readers retire. */
export function collapseIdentityWhitespace(value: string): string {
  for (const codePoint of [0x1c, 0x1d, 0x1e, 0x1f])
    value = value.replaceAll(String.fromCodePoint(codePoint), ' ');
  return value
    .split(/\p{White_Space}+/u)
    .filter(Boolean)
    .join(' ');
}

/** Unicode default case folding is part of the persisted query identity. */
export function normalizeQuery(value: string): string {
  return collapseIdentityWhitespace(casefold(value.normalize('NFKC')));
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Canonical page identity, without fetching or performing URL admission. */
export function canonicalPage(input: string, origin?: string | null): string | null {
  try {
    let value = input.trim();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:/iu.test(value) && origin)
      value = new URL(value, `${origin.replace(/\/+$/u, '')}/`).href;
    const parsed = new URL(value);
    const scheme = parsed.protocol.slice(0, -1);
    if (!policy.traffic.url_schemes.includes(scheme) || parsed.username || parsed.password)
      return null;
    // Site Health still stores the compared url_hash. Retain its raw path
    // (including dot segments) and Unicode-folded hostname in this identity only.
    const raw = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/iu.exec(value);
    if (!raw || raw[1]!.includes('@')) return null;
    const rawHost = raw[1]!.replace(/:\d+$/u, '');
    const host = domainToASCII(normalizeQuery(rawHost.replace(/\.+$/u, '')));
    if (!host) return null;
    const defaultPort = scheme === 'https' ? 443 : 80;
    const port = parsed.port ? Number(parsed.port) : defaultPort;
    if (!policy.traffic.url_ports.includes(port)) return null;
    const path = (raw[2] || '/').replace(/%([0-9a-f]{2})/giu, (_match, hex: string) => {
      const char = String.fromCharCode(Number.parseInt(hex, 16));
      return /[a-z0-9\-._~]/iu.test(char) ? char : `%${hex.toUpperCase()}`;
    });
    const encoded = [...path]
      .map((char) =>
        /[A-Za-z0-9/%:@!$&'()*+,;=~._-]/u.test(char) ? char : encodeURIComponent(char),
      )
      .join('');
    const pairs = [...parsed.searchParams].filter(
      ([key]) => !policy.traffic.ignored_query_keys.includes(key.toLowerCase()),
    );
    pairs.sort(([ak, av], [bk, bv]) => compareIdentityText(ak, bk) || compareIdentityText(av, bv));
    const quote = (s: string) =>
      encodeURIComponent(s)
        .replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%20/gu, '+');
    const query = pairs.map(([k, v]) => `${quote(k)}=${quote(v)}`).join('&');
    return `${scheme}://${host}${port === defaultPort ? '' : `:${port}`}${encoded}${query ? `?${query}` : ''}`;
  } catch {
    return null;
  }
}
