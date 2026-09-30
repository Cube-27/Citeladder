import { createHash } from 'node:crypto';
import { getDomain } from 'tldts';

import { policy } from '../config.ts';
import { compareIdentityText } from '../analysis/comparison.ts';
import { publicUrl } from '../projects/safe-fetch.ts';

export function canonicalIdentity(value: string, base?: string) {
  const url = publicUrl(value, base);
  url.hostname = url.hostname.replace(/\.$/u, '');
  url.pathname = url.pathname.replaceAll(/%([0-9a-f]{2})/giu, (raw, hex: string) => {
    const char = String.fromCharCode(parseInt(hex, 16));
    return /[a-z0-9\-._~]/iu.test(char) ? char : raw;
  });
  const ignored = new Set([
    ...policy.site_health.tracking_params,
    ...policy.site_health.ignored_query_keys,
  ]);
  const pairs = [...url.searchParams]
    .filter(([key]) => !ignored.has(key.toLowerCase()))
    .sort((a, b) => compareIdentityText(a[0], b[0]) || compareIdentityText(a[1], b[1]));
  url.search = '';
  for (const [key, value] of pairs) url.searchParams.append(key, value);
  return {
    url: url.href,
    hash: createHash('sha256').update(url.href).digest('hex'),
    domain: getDomain(url.hostname) ?? url.hostname,
  };
}
export function citationIdentity(value: string) {
  try {
    const identity = canonicalIdentity(value);
    const host = new URL(identity.url).hostname;
    if (
      policy.source_pages.redirect_hosts.some(
        (redirect) => host === redirect || host.endsWith(`.${redirect}`),
      )
    )
      return null;
    return identity;
  } catch {
    return null;
  }
}
