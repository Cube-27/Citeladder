/**
 * Safe outbound links to pages we do not own.
 *
 * Every cited URL in this product came from a model's answer or a publisher's
 * redirect, so it is untrusted input. Only `http:` and `https:` become an
 * `href`; anything else (a `javascript:` token, a malformed string) renders as
 * plain text rather than as a link nobody vetted.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
