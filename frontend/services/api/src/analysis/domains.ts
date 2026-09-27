/** Domain identities and grounding redirects in recorded citation evidence. */
const GOOGLE_REDIRECT_HOST = 'vertexaisearch.cloud.google.com';
const GROUNDING_REDIRECT_MARKER = 'grounding-api-redirect';

/** Lowercase host without www., accepting a bare domain or an absolute URL. */
export function normalizeDomain(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const text = value.trim();
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return url.hostname.replace(/^www\./u, '');
  } catch {
    return '';
  }
}

export function domainMatches(candidate: unknown, target: unknown): boolean {
  const left = normalizeDomain(candidate);
  const right = normalizeDomain(target);
  return Boolean(left && right && (left === right || left.endsWith(`.${right}`)));
}

/** Redirect tokens are not publisher identities. */
export function isGroundingRedirect(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  try {
    const host = new URL(raw).hostname.replace(/\.+$/u, '');
    return (
      host === GOOGLE_REDIRECT_HOST ||
      host.endsWith(`.${GOOGLE_REDIRECT_HOST}`) ||
      host === GROUNDING_REDIRECT_MARKER
    );
  } catch {
    return !raw.includes('://') && raw.toLowerCase().includes(GROUNDING_REDIRECT_MARKER);
  }
}
