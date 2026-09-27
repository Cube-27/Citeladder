/** Page grouping identity shared with the Python Action reader until PR 7b. */
import { policy } from '../config.ts';
import { casefold } from '../traffic/normalization.ts';

export function normalizedUrlForCompare(url: string): string {
  const text = url.trim();
  try {
    const parsed = new URL(text);
    if (!parsed.hostname) return text.toLowerCase();
    // Python still groups the persisted Action by this exact form. Validate
    // with URL, but retain the observed host/path rather than URL's IDNA and
    // dot-segment normalization. This is not crawler identity.
    const raw = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/iu.exec(text);
    if (!raw) return text.toLowerCase();
    const host = raw[1]!
      .replace(/^.*@/u, '')
      .replace(/:\d*$/u, '')
      .replace(/^\[|\]$/gu, '')
      .toLowerCase();
    const authority = `${host}${parsed.port ? `:${parsed.port}` : ''}`;
    const path = raw[2]!.replace(/\/+$/u, '') || '/';
    const pairs = [...new URLSearchParams(raw[3])].filter(
      ([key]) => !policy.opportunity.tracking_query_params.includes(casefold(key)),
    );
    const quote = (value: string) =>
      encodeURIComponent(value)
        .replace(/[!'()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/%20/gu, '+');
    const query = pairs.map(([key, value]) => `${quote(key)}=${quote(value)}`).join('&');
    return `${parsed.protocol}//${authority}${path}${query ? `?${query}` : ''}`;
  } catch {
    return text.toLowerCase();
  }
}
