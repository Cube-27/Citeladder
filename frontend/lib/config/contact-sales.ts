// Apart from the contact form's schemas, so the eager app shell never loads them.
const CONTACT_PATH = '/contact';

/** Retained published catalogs can still carry the former CiteLadder intake URL. */
export function contactSalesHref(href: string | null | undefined, fallback = CONTACT_PATH): string {
  if (!href) return fallback;
  try {
    const url = new URL(href);
    if (
      ['cube27.com', 'www.cube27.com'].includes(url.hostname) &&
      /^\/contact\/?$/.test(url.pathname)
    )
      return fallback;
  } catch {
    // Other catalog destinations retain their existing meaning.
  }
  return href;
}
