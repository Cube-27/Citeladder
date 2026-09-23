/**
 * Safe outbound links to pages we do not own.
 *
 * Every cited URL in this product came from a model's answer or a publisher's
 * redirect, so it is untrusted input. Only `http:` and `https:` become an
 * `href`; anything else (a `javascript:` token, a malformed string) renders as
 * plain text rather than as a link nobody vetted.
 */
import { parseAbsoluteHttpUrl } from '@/lib/safe-http-url';

export function safeExternalUrl(value: string | null | undefined): string | null {
  return parseAbsoluteHttpUrl(value)?.toString() ?? null;
}
